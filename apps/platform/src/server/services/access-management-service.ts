import 'server-only';

import {
  AccessManagementSchema,
  AccessUserSchema,
  type AccessManagement,
  type AccessUser,
} from '@supernizo/shared';
import { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { directorySyncEnabled } from '@/server/integrations/supernizo-signature';
import { fetchDirectoryUser } from '@/server/integrations/supernizo-directory-client';
import { applyDirectoryState } from './supernizo-directory-service';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/errors/app-error';

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

export async function updateAgentEventAssignments(
  actorUserId: string,
  targetUserId: string,
  siteIds: readonly string[],
): Promise<AccessUser> {
  const database = getDatabaseClient();
  const target = await database.user.findUnique({
    where: { id: targetUserId },
    select: { supernizoId: true, globalRole: true },
  });
  if (!target) throw new NotFoundError('The requested user does not exist.');
  if (!target.supernizoId || target.globalRole !== 'AGENT')
    throw new ForbiddenError('Only Supernizo-managed agents can be assigned to events.');
  if (!directorySyncEnabled())
    throw new ForbiddenError('Enable Supernizo directory synchronization before assigning events.');

  const state = await fetchDirectoryUser(target.supernizoId);
  return database.$transaction(async (transaction) => {
    await applyDirectoryState(transaction, state);
    const current = await transaction.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: accessUserSelect,
    });
    if (current.supernizoState?.eligibility !== 'ELIGIBLE')
      throw new ForbiddenError('This user no longer has Autocall access.');
    if (current.globalRole !== 'AGENT')
      throw new ForbiddenError('Only Supernizo-managed agents can be assigned to events.');
    await assertSitesExist(transaction, siteIds);
    await transaction.siteMember.deleteMany({
      where: { userId: targetUserId, siteId: { notIn: [...siteIds] } },
    });
    await transaction.siteMember.createMany({
      data: siteIds.map((siteId) => ({ siteId, userId: targetUserId })),
      skipDuplicates: true,
    });
    await transaction.auditLog.create({
      data: {
        action: 'user.events.updated',
        actorUserId,
        entityId: targetUserId,
        entityType: 'User',
        metadata: { directoryRevision: state.directoryRevision, siteIds },
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
