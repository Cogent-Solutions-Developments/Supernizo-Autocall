import 'server-only';

import { hash } from 'bcryptjs';

import {
  AccessManagementSchema,
  AccessUserSchema,
  type AccessManagement,
  type AccessUser,
  type ManagedUserCreateInput,
  type ManagedUserUpdateInput,
  type StaffRole,
} from '@supernizo/shared';
import { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { directorySyncEnabled } from '@/server/integrations/supernizo-signature';
import { fetchDirectoryUser } from '@/server/integrations/supernizo-directory-client';
import { applyDirectoryState } from './supernizo-directory-service';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/errors/app-error';

const accessUserSelect = {
  supernizoId: true,
  supernizoState: { select: { eligibility: true, lastSyncedAt: true } },
  createdAt: true,
  displayName: true,
  email: true,
  globalRole: true,
  id: true,
  siteMemberships: { select: { siteId: true } },
  updatedAt: true,
} satisfies Prisma.UserSelect;

type AccessUserRecord = Prisma.UserGetPayload<{ select: typeof accessUserSelect }>;

function mapAccessUser(user: AccessUserRecord): AccessUser {
  return AccessUserSchema.parse({
    source: user.supernizoId ? 'SUPERNIZO' : 'LOCAL',
    eligibility: user.supernizoId ? (user.supernizoState?.eligibility ?? 'UNKNOWN') : 'LOCAL',
    lastSyncedAt: user.supernizoState?.lastSyncedAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.globalRole,
    siteIds: user.siteMemberships.map(({ siteId }) => siteId).sort(),
    updatedAt: user.updatedAt.toISOString(),
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export function assignedSiteIdsForRole(role: StaffRole, siteIds: readonly string[]): string[] {
  return role === 'ADMIN' ? [] : Array.from(new Set(siteIds)).sort();
}

export function assertManagedRoleChange(
  input: Readonly<{
    actorUserId: string;
    administratorCount: number;
    currentRole: StaffRole;
    nextRole: StaffRole;
    targetUserId: string;
  }>,
): void {
  if (input.currentRole !== 'ADMIN' || input.nextRole !== 'AGENT') {
    return;
  }

  if (input.actorUserId === input.targetUserId) {
    throw new ForbiddenError('You cannot demote your own administrator account.');
  }

  if (input.administratorCount <= 1) {
    throw new ConflictError('The final administrator account cannot be demoted.');
  }
}

async function assertSitesExist(
  transaction: Prisma.TransactionClient,
  siteIds: readonly string[],
): Promise<void> {
  if (siteIds.length === 0) return;

  const sites = await transaction.site.findMany({
    where: { id: { in: [...siteIds] } },
    select: { id: true },
  });
  if (sites.length !== siteIds.length) {
    throw new ValidationError('One or more assigned events do not exist.');
  }
}

export async function listAccessManagement(): Promise<AccessManagement> {
  const database = getDatabaseClient();
  const [sites, users] = await Promise.all([
    database.site.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    database.user.findMany({
      orderBy: { email: 'asc' },
      select: accessUserSelect,
    }),
  ]);

  return AccessManagementSchema.parse({
    sites,
    users: users.map(mapAccessUser),
  });
}

export async function createManagedUser(
  actorUserId: string,
  input: ManagedUserCreateInput,
): Promise<AccessUser> {
  if (input.role !== 'ADMIN' || input.siteIds.length > 0) {
    throw new ForbiddenError(
      'Create agents and grant Autocall access in Supernizo. Only local administrators can be created here.',
    );
  }
  if (input.email.toLowerCase().endsWith('@supernizo.invalid')) {
    throw new ForbiddenError('This email namespace is reserved for Supernizo identities.');
  }
  const database = getDatabaseClient();
  const siteIds = assignedSiteIdsForRole(input.role, input.siteIds);
  const passwordHash = await hash(input.password, 12);

  try {
    return await database.$transaction(async (transaction) => {
      await assertSitesExist(transaction, siteIds);
      const user = await transaction.user.create({
        data: {
          displayName: input.displayName,
          email: input.email.toLowerCase(),
          globalRole: input.role,
          passwordHash,
          ...(siteIds.length > 0
            ? { siteMemberships: { create: siteIds.map((siteId) => ({ siteId })) } }
            : {}),
        },
        select: accessUserSelect,
      });

      await transaction.auditLog.create({
        data: {
          action: 'user.access.created',
          actorUserId,
          entityId: user.id,
          entityType: 'User',
          metadata: { role: input.role, siteIds },
        },
      });

      return mapAccessUser(user);
    });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError('A user with this email address already exists.');
    }
    throw error;
  }
}

export async function updateManagedUser(
  actorUserId: string,
  targetUserId: string,
  input: ManagedUserUpdateInput,
): Promise<AccessUser> {
  const database = getDatabaseClient();
  const target = await database.user.findUnique({
    where: { id: targetUserId },
    select: { supernizoId: true, globalRole: true },
  });
  if (!target) throw new NotFoundError('The requested user does not exist.');
  if (target.supernizoId) {
    if (!directorySyncEnabled())
      throw new ForbiddenError(
        'Enable Supernizo directory synchronization before assigning this user.',
      );
    const state = await fetchDirectoryUser(target.supernizoId);
    return database.$transaction(async (transaction) => {
      await applyDirectoryState(transaction, state);
      const current = await transaction.user.findUniqueOrThrow({
        where: { id: targetUserId },
        select: accessUserSelect,
      });
      if (current.displayName !== input.displayName || current.globalRole !== input.role)
        throw new ForbiddenError(
          'Names and roles are managed in Supernizo. Refresh the user list.',
        );
      if (current.supernizoState?.eligibility !== 'ELIGIBLE')
        throw new ForbiddenError('This user no longer has Autocall access.');
      if (current.globalRole !== 'AGENT') {
        if (input.siteIds.length)
          throw new ForbiddenError('Supernizo administrators already have global access.');
        return mapAccessUser(current); // Do not erase memberships on promotion.
      }
      await assertSitesExist(transaction, input.siteIds);
      await transaction.siteMember.deleteMany({
        where: { userId: targetUserId, siteId: { notIn: input.siteIds } },
      });
      await transaction.siteMember.createMany({
        data: input.siteIds.map((siteId) => ({ siteId, userId: targetUserId })),
        skipDuplicates: true,
      });
      await transaction.auditLog.create({
        data: {
          action: 'user.sites.updated',
          actorUserId,
          entityId: targetUserId,
          entityType: 'User',
          metadata: { siteIds: input.siteIds, directoryRevision: state.directoryRevision },
        },
      });
      return mapAccessUser(
        await transaction.user.findUniqueOrThrow({
          where: { id: targetUserId },
          select: accessUserSelect,
        }),
      );
    });
  }
  if (target.globalRole !== 'ADMIN' || input.role !== 'ADMIN' || input.siteIds.length > 0)
    throw new ForbiddenError(
      'Local agents are historical records. Manage agent identity in Supernizo.',
    );
  const siteIds = assignedSiteIdsForRole(input.role, input.siteIds);

  return database.$transaction(
    async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { id: targetUserId },
        select: { globalRole: true, id: true },
      });
      if (!existingUser) {
        throw new NotFoundError('The requested user does not exist.');
      }

      const administratorCount =
        existingUser.globalRole === 'ADMIN' && input.role === 'AGENT'
          ? await transaction.user.count({ where: { globalRole: 'ADMIN' } })
          : 0;
      assertManagedRoleChange({
        actorUserId,
        administratorCount,
        currentRole: existingUser.globalRole,
        nextRole: input.role,
        targetUserId,
      });
      await assertSitesExist(transaction, siteIds);

      await transaction.siteMember.deleteMany({ where: { userId: targetUserId } });
      if (siteIds.length > 0) {
        await transaction.siteMember.createMany({
          data: siteIds.map((siteId) => ({ siteId, userId: targetUserId })),
        });
      }

      const updatedUser = await transaction.user.update({
        where: { id: targetUserId },
        data: { displayName: input.displayName, globalRole: input.role },
        select: accessUserSelect,
      });
      await transaction.auditLog.create({
        data: {
          action: 'user.access.updated',
          actorUserId,
          entityId: targetUserId,
          entityType: 'User',
          metadata: { role: input.role, siteIds },
        },
      });

      return mapAccessUser(updatedUser);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
