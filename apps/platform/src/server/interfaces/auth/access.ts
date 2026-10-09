import 'server-only';

import { cache } from 'react';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';

import type { StaffRole } from '@supernizo/shared';

import { getAuthOptions } from '@/server/interfaces/auth/auth-options';
import { assertRole } from '@/server/domain/auth/roles';
import {
  getAuthenticationAccount,
  assertSiteAvailable,
} from '@/server/composition/auth/auth-service';
import { UnauthorizedError } from '@/server/domain/errors/app-error';
import { portalUrl, requestSupernizoIdentity } from '@/server/interfaces/auth/supernizo-sso';

export type AuthenticatedUser = Readonly<{
  signInMethod: 'local' | 'supernizo';
  returnTo?: string | undefined;
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

export const requireUser = cache(async (): Promise<AuthenticatedUser> => {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication is required.');
  }

  const user = await getAuthenticationAccount(userId);

  if (!user) {
    throw new UnauthorizedError('Authentication is required.');
  }

  let role = user.globalRole;
  const upstream = session?.user?.supernizo;
  if (upstream) {
    if (user.supernizoId !== upstream.subject) throw new UnauthorizedError('Invalid identity.');
    const identity = await requestSupernizoIdentity('introspect', {
      subject: upstream.subject,
      version: upstream.version,
      expiresAt: upstream.expiresAt,
    });
    if (identity.subject !== upstream.subject) throw new UnauthorizedError('Invalid identity.');
    role = identity.role;
  } else if (user.globalRole !== 'ADMIN' || user.supernizoId) {
    // Also reject pre-existing local agent sessions after rollout.
    throw new UnauthorizedError('Sign in through Supernizo.');
  }

  return {
    signInMethod: upstream ? 'supernizo' : 'local',
    returnTo: upstream?.portal
      ? portalUrl(upstream.portal).href.replace(/\/autocall$/, '')
      : undefined,
    email: user.email,
    id: user.id,
    name: user.displayName,
    role,
  };
});

export async function requireDashboardUser(): Promise<AuthenticatedUser> {
  try {
    return await requireUser();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      // App Router adds `basePath` to redirect targets. Supplying it here would
      // create `/autocall-db/autocall-db/login`.
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

  // Supernizo eligibility is checked by requireUser; event assignments are retired.
  await assertSiteAvailable(siteId);

  return {
    siteId,
    siteRole: user.role,
    user,
  };
}
