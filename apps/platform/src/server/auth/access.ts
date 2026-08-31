import 'server-only';

import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';

import type { StaffRole } from '@supernizo/shared';

import { getAuthOptions } from '@/server/auth/auth-options';
import { assertRole } from '@/server/auth/roles';
import { getDatabaseClient } from '@/server/db/client';
import { ForbiddenError, UnauthorizedError } from '@/server/errors/app-error';

export type AuthenticatedUser = Readonly<{
  email: string;
  id: string;
  name: string | null;
  role: StaffRole;
}>;

export type SiteAccess = Readonly<{
  siteId: string;
  siteRole: StaffRole;
  user: AuthenticatedUser;
}>;

export async function requireUser(): Promise<AuthenticatedUser> {
  const prisma = getDatabaseClient();
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      email: true,
      globalRole: true,
      id: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Authentication is required.');
  }

  return {
    email: user.email,
    id: user.id,
    name: user.displayName,
    role: user.globalRole,
  };
}

export async function requireDashboardUser(): Promise<AuthenticatedUser> {
  try {
    return await requireUser();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      redirect('/login');
    }

    throw error;
  }
}

export async function requireRole(
  ...allowedRoles: readonly StaffRole[]
): Promise<AuthenticatedUser> {
  const user = await requireUser();

  assertRole(user.role, allowedRoles);

  return user;
}

export async function requireSiteAccess(siteId: string): Promise<SiteAccess> {
  const user = await requireUser();

  if (user.role === 'ADMIN') {
    return { siteId, siteRole: 'ADMIN', user };
  }

  const membership = await getDatabaseClient().siteMember.findUnique({
    where: {
      siteId_userId: {
        siteId,
        userId: user.id,
      },
    },
    select: { role: true },
  });

  if (!membership) {
    throw new ForbiddenError('You do not have access to this site.');
  }

  return {
    siteId,
    siteRole: membership.role,
    user,
  };
}
