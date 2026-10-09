import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from './auth-service';
import type { AuthRepository, AuthenticationAccount } from '../ports/auth-repository';
import { ForbiddenError } from '@/server/domain/errors/app-error';
const account: AuthenticationAccount & { passwordHash: string } = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  globalRole: 'ADMIN',
  supernizoId: null,
  passwordHash: 'stored-hash',
};
function setup() {
  const repository: AuthRepository = {
    findAccount: vi.fn(async () => account),
    findLocalAccount: vi.fn(async () => account),
    findSiteStatus: vi.fn(async () => ({ status: 'ACTIVE' as const })),
    saveSupernizoAccount: vi.fn(async () => account),
  };
  const allowAdminLogin = vi.fn(async () => true);
  const verifyPassword = vi.fn(async () => true);
  return {
    repository,
    allowAdminLogin,
    verifyPassword,
    service: createAuthService({ repository, allowAdminLogin, verifyPassword }),
  };
}
describe('authentication with injected dependencies', () => {
  it('rejects invalid and throttled credentials before reading passwords', async () => {
    const { service, repository, allowAdminLogin } = setup();
    expect(await service.authorizeLocalAdmin({ email: 'bad', password: '' })).toBeNull();
    expect(allowAdminLogin).not.toHaveBeenCalled();
    allowAdminLogin.mockResolvedValue(false);
    expect(
      await service.authorizeLocalAdmin({ email: account.email, password: 'secret' }),
    ).toBeNull();
    expect(repository.findLocalAccount).not.toHaveBeenCalled();
  });
  it.each([
    { globalRole: 'AGENT' as const, supernizoId: null },
    { globalRole: 'ADMIN' as const, supernizoId: 'upstream' },
  ])('rejects ineligible local identities: %j', async (fields) => {
    const { service, repository, verifyPassword } = setup();
    vi.mocked(repository.findLocalAccount).mockResolvedValue({ ...account, ...fields });
    expect(
      await service.authorizeLocalAdmin({ email: account.email, password: 'secret' }),
    ).toBeNull();
    expect(verifyPassword).not.toHaveBeenCalled();
  });
  it('verifies credentials and exposes only the sign-in result', async () => {
    const { service, verifyPassword } = setup();
    expect(await service.authorizeLocalAdmin({ email: account.email, password: 'secret' })).toEqual(
      { id: account.id, email: account.email, name: 'Admin', role: 'ADMIN' },
    );
    expect(verifyPassword).toHaveBeenCalledWith('secret', 'stored-hash');
    verifyPassword.mockResolvedValue(false);
    expect(
      await service.authorizeLocalAdmin({ email: account.email, password: 'incorrect' }),
    ).toBeNull();
  });
  it('denies access to inactive or missing sites', async () => {
    const { service, repository } = setup();
    vi.mocked(repository.findSiteStatus).mockResolvedValue({ status: 'INACTIVE' });
    await expect(service.assertSiteAvailable('site-1')).rejects.toBeInstanceOf(ForbiddenError);
    vi.mocked(repository.findSiteStatus).mockResolvedValue(null);
    await expect(service.assertSiteAvailable('missing')).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('provisions by immutable upstream subject', async () => {
    const { service, repository } = setup();
    await service.provisionSupernizoAccount({ subject: 'subject-1', name: 'Agent', role: 'AGENT' });
    expect(repository.saveSupernizoAccount).toHaveBeenCalledWith({
      subject: 'subject-1',
      email: 'subject-1@supernizo.invalid',
      name: 'Agent',
      role: 'AGENT',
    });
  });
});
