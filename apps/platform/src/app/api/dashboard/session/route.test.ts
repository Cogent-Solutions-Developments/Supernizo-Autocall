import { beforeEach, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/auth/access';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/errors/app-error';
import { GET } from './route';

vi.mock('@/server/auth/access', () => ({ requireUser: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('checks the live identity on every request and never caches a grant or rejection', async () => {
  vi.mocked(requireUser).mockResolvedValue({
    id: 'agent',
    email: 'agent@example.com',
    name: 'Agent',
    role: 'AGENT',
    signInMethod: 'supernizo',
  });
  const request = new Request('http://localhost/autocall-db/api/dashboard/session');
  const granted = await GET(request);
  expect(granted.status).toBe(204);
  expect(granted.headers.get('Cache-Control')).toBe('no-store');
  expect(await granted.text()).toBe('');
  vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError('Access revoked.'));
  const revoked = await GET(request);
  expect(revoked.status).toBe(401);
  expect(revoked.headers.get('Cache-Control')).toBe('no-store');
  expect(requireUser).toHaveBeenCalledTimes(2);
});

it('distinguishes an upstream outage from revocation', async () => {
  vi.mocked(requireUser).mockRejectedValue(new ServiceUnavailableError('Retry.'));
  const response = await GET(new Request('http://localhost/api/dashboard/session'));
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
