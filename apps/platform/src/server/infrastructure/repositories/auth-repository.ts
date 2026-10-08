import 'server-only';
import type { AuthRepository } from '@/server/application/ports/auth-repository';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
const accountSelect = {
  displayName: true,
  email: true,
  globalRole: true,
  id: true,
  supernizoId: true,
} as const;
export function createAuthRepository(): AuthRepository {
  return {
    findAccount: (userId) =>
      getDatabaseClient().user.findUnique({ where: { id: userId }, select: accountSelect }),
    findLocalAccount: (email) =>
      getDatabaseClient().user.findUnique({
        where: { email },
        select: { ...accountSelect, passwordHash: true },
      }),
    findSiteStatus: (siteId) =>
      getDatabaseClient().site.findUnique({ where: { id: siteId }, select: { status: true } }),
    saveSupernizoAccount: (identity) =>
      getDatabaseClient().user.upsert({
        where: { supernizoId: identity.subject },
        create: {
          supernizoId: identity.subject,
          email: identity.email,
          displayName: identity.name,
          globalRole: identity.role,
        },
        update: { displayName: identity.name, globalRole: identity.role },
        select: { id: true, email: true, displayName: true },
      }),
  };
}
