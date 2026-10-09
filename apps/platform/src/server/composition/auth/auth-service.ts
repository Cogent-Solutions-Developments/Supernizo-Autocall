import 'server-only';
import { compare } from 'bcryptjs';
import { createAuthService } from '@/server/application/auth/auth-service';
import { createAuthRepository } from '@/server/infrastructure/repositories/auth-repository';
import { allowAdminLogin } from '@/server/infrastructure/security/admin-login';
export const {
  getAuthenticationAccount,
  assertSiteAvailable,
  authorizeLocalAdmin,
  provisionSupernizoAccount,
} = createAuthService({
  repository: createAuthRepository(),
  allowAdminLogin,
  verifyPassword: compare,
});
