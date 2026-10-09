import 'server-only';
import { z } from 'zod';
import type { StaffRole } from '@supernizo/shared';
import type { AuthRepository } from '@/server/application/ports/auth-repository';
import { ForbiddenError } from '@/server/domain/errors/app-error';
const credentialsSchema = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(1).max(1024),
});
export function createAuthService(dependencies: {
  repository: AuthRepository;
  allowAdminLogin(email: string): Promise<boolean>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}) {
  const { repository, allowAdminLogin, verifyPassword } = dependencies;
  return {
    getAuthenticationAccount: (userId: string) => repository.findAccount(userId),
    async assertSiteAvailable(siteId: string): Promise<void> {
      const site = await repository.findSiteStatus(siteId);
      if (!site || site.status !== 'ACTIVE')
        throw new ForbiddenError('This event is not active or is unavailable.');
    },
    async authorizeLocalAdmin(credentials: unknown) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      if (!(await allowAdminLogin(parsed.data.email))) return null;
      const user = await repository.findLocalAccount(parsed.data.email);
      if (!user?.passwordHash || user.globalRole !== 'ADMIN' || user.supernizoId) return null;
      if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;
      return { email: user.email, id: user.id, name: user.displayName, role: user.globalRole };
    },
    provisionSupernizoAccount: (identity: { subject: string; name: string; role: StaffRole }) =>
      repository.saveSupernizoAccount({
        ...identity,
        email: identity.subject + '@supernizo.invalid',
      }),
  };
}
