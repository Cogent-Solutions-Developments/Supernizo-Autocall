import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requireUser } from '@/server/interfaces/auth/access';
import { getProfile, updateProfile } from '@/server/composition/profile/profile-service';
import { UnauthorizedError } from '@/server/domain/errors/app-error';
import { GET, PATCH } from './route';

vi.mock('@/server/interfaces/auth/access', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/composition/profile/profile-service', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));
const appUrl = 'https://api.infrastructuresg.com/autocall-db';
const url = 'http://app:3000/autocall-db/api/dashboard/profile';
const profile = { displayName: 'Alex', imageUrl: null };
const user = {
  id: 'agent-1',
  email: 'agent@example.com',
  name: 'Agent',
  role: 'AGENT' as const,
  signInMethod: 'supernizo' as const,
};
function request(body: string, origin = new URL(appUrl).origin) {
  return new Request(url, {
    method: 'PATCH',
    headers: { origin, 'Content-Type': 'application/json' },
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_URL', appUrl);
  vi.mocked(requireUser).mockResolvedValue(user);
  vi.mocked(getProfile).mockResolvedValue(profile);
  vi.mocked(updateProfile).mockResolvedValue(profile);
});
afterEach(() => vi.unstubAllEnvs());
it('returns the own profile with no caching', async () => {
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect((await response.json()).data).toEqual(profile);
  expect(getProfile).toHaveBeenCalledWith(user);
});
it('uses the authenticated id when saving a profile', async () => {
  const response = await PATCH(request(JSON.stringify(profile)));
  expect(response.status).toBe(200);
  expect(updateProfile).toHaveBeenCalledWith('agent-1', profile);
});
it('rejects unauthenticated reads and writes before processing input', async () => {
  vi.mocked(requireUser).mockRejectedValue(new UnauthorizedError('Sign in required.'));
  expect((await GET(new Request(url))).status).toBe(401);
  expect((await PATCH(request(JSON.stringify(profile)))).status).toBe(401);
  expect(updateProfile).not.toHaveBeenCalled();
});
it('rejects forged origins and missing origins', async () => {
  expect((await PATCH(request(JSON.stringify(profile), 'https://attacker.example'))).status).toBe(
    403,
  );
  expect(
    (
      await PATCH(
        new Request(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        }),
      )
    ).status,
  ).toBe(403);
  expect(updateProfile).not.toHaveBeenCalled();
});
it('rejects malformed, oversized and invalid requests', async () => {
  for (const body of [
    '{',
    JSON.stringify({ ...profile, userId: 'someone-else' }),
    JSON.stringify({ ...profile, displayName: '' }),
    ' '.repeat(370001),
  ]) {
    expect((await PATCH(request(body))).status).toBe(400);
  }
  expect(updateProfile).not.toHaveBeenCalled();
});
it('does not leak internal failures', async () => {
  vi.mocked(updateProfile).mockRejectedValue(new Error('database secret'));
  const response = await PATCH(request(JSON.stringify(profile)));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('database secret');
});
