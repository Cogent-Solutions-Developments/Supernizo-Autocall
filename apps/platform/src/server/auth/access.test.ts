import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  site: vi.fn(),
  introspect: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('next-auth/next', () => ({ getServerSession: mocks.session }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/server/auth/auth-options', () => ({ getAuthOptions: () => ({}) }));
vi.mock('@/server/db/client', () => ({
  getDatabaseClient: () => ({
    user: { findUnique: mocks.user },
    site: { findUnique: mocks.site },
  }),
}));
vi.mock('@/server/auth/supernizo-sso', () => ({
  requestSupernizoIdentity: mocks.introspect,
  portalUrl: () => new URL('https://app.example/autocall'),
}));
import { requireUser, requireDashboardUser, requireRole, requireSiteAccess } from './access';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/errors/app-error';
const subject = '17e772b0-2a9b-4ea6-8d35-e6045e97f8a6';
beforeEach(() => {
  vi.resetAllMocks();
});

it('rejects existing local agent sessions', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'agent' } });
  mocks.user.mockResolvedValue({ id: 'agent', globalRole: 'AGENT' });
  await expect(requireUser()).rejects.toThrow('Sign in through Supernizo');
});
it('uses a route-relative login redirect so App Router applies the base path once', async () => {
  mocks.session.mockResolvedValue(null);
  await expect(requireDashboardUser()).rejects.toThrow('redirect:/login');
  expect(mocks.redirect).toHaveBeenCalledWith('/login');
});
it('retains local administrator access without contacting Supernizo', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'admin' } });
  mocks.user.mockResolvedValue({ id: 'admin', globalRole: 'ADMIN' });
  await expect(requireUser()).resolves.toMatchObject({
    id: 'admin',
    role: 'ADMIN',
    signInMethod: 'local',
  });
  expect(mocks.introspect).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'AGENT'])(
  'identifies Supernizo sign-in independently of the %s role or return link',
  async (role) => {
    mocks.session.mockResolvedValue({
      user: { id: 'sso-user', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
    });
    mocks.user.mockResolvedValue({ id: 'sso-user', supernizoId: subject, globalRole: role });
    mocks.introspect.mockResolvedValue({ subject, role });
    await expect(requireUser()).resolves.toMatchObject({
      signInMethod: 'supernizo',
      role,
      returnTo: undefined,
    });
  },
);
it('uses live upstream permissions even when local role says ADMIN', async () => {
  mocks.session.mockResolvedValue({
    user: { id: 'agent', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
  });
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: subject, globalRole: 'ADMIN' });
  mocks.introspect.mockResolvedValue({ subject, role: 'AGENT' });
  await expect(requireRole('ADMIN')).rejects.toThrow();
  mocks.site.mockResolvedValue({ status: 'ACTIVE' });
  await expect(requireSiteAccess('unassigned-event')).resolves.toMatchObject({
    siteId: 'unassigned-event',
    siteRole: 'AGENT',
  });
  mocks.site.mockResolvedValue({ status: 'INACTIVE' });
  await expect(requireSiteAccess('inactive-event')).rejects.toThrow('not active');
});
it('rejects revoked sessions and mismatched identity mappings', async () => {
  mocks.session.mockResolvedValue({
    user: { id: 'agent', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
  });
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: subject, globalRole: 'AGENT' });
  mocks.introspect.mockRejectedValue(new UnauthorizedError('revoked'));
  await expect(requireUser()).rejects.toThrow('revoked');
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: 'another-user', globalRole: 'ADMIN' });
  await expect(requireUser()).rejects.toThrow('Invalid identity');
});

it('denies access during temporary outages without redirecting the session to login', async () => {
  mocks.session.mockResolvedValue({
    user: { id: 'agent', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
  });
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: subject, globalRole: 'AGENT' });
  const unavailable = new ServiceUnavailableError('Please retry.');
  mocks.introspect.mockRejectedValue(unavailable);
  for (let attempt = 0; attempt < 6; attempt++) {
    await expect(requireDashboardUser()).rejects.toBe(unavailable);
  }
  mocks.introspect.mockResolvedValue({ subject, role: 'AGENT' });
  await expect(requireDashboardUser()).resolves.toMatchObject({ id: 'agent', role: 'AGENT' });
});

it.each([{ status: 'INACTIVE' }, null])('denies unavailable events to agents: %j', async (site) => {
  mocks.session.mockResolvedValue({
    user: { id: 'agent', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
  });
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: subject, globalRole: 'AGENT' });
  mocks.introspect.mockResolvedValue({ subject, role: 'AGENT' });
  mocks.site.mockResolvedValue(site);
  await expect(requireSiteAccess('event')).rejects.toThrow('not active');
});

it('grants access to multiple active events without any membership or directory roster lookup', async () => {
  mocks.session.mockResolvedValue({
    user: { id: 'agent', supernizo: { subject, version: 2, expiresAt: 9999999999 } },
  });
  mocks.user.mockResolvedValue({ id: 'agent', supernizoId: subject, globalRole: 'AGENT' });
  mocks.introspect.mockResolvedValue({ subject, role: 'AGENT' });
  mocks.site.mockResolvedValue({ status: 'ACTIVE' });
  for (const siteId of ['first-event', 'new-event']) {
    await expect(requireSiteAccess(siteId)).resolves.toMatchObject({ siteId, siteRole: 'AGENT' });
  }
  mocks.introspect.mockRejectedValue(new UnauthorizedError('revoked'));
  await expect(requireSiteAccess('first-event')).rejects.toThrow('revoked');
});

it('preserves administrator access to inactive events for management', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'admin' } });
  mocks.user.mockResolvedValue({ id: 'admin', globalRole: 'ADMIN' });
  await expect(requireSiteAccess('inactive-event')).resolves.toMatchObject({ siteRole: 'ADMIN' });
});

it('rejects unauthenticated event access before reading any event', async () => {
  mocks.session.mockResolvedValue(null);
  await expect(requireSiteAccess('active-event')).rejects.toBeInstanceOf(UnauthorizedError);
  expect(mocks.site).not.toHaveBeenCalled();
});
