import { beforeEach, expect, it, vi } from 'vitest';
import { requireRole } from '@/server/auth/access';
import { ForbiddenError, UnauthorizedError } from '@/server/errors/app-error';
import { PATCH } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('rejects the retired assignment endpoint even for administrators', async () => {
  vi.mocked(requireRole).mockResolvedValue({
    signInMethod: 'local',
    email: 'admin@example.com',
    id: 'admin',
    name: 'Admin',
    role: 'ADMIN',
  });
  const response = await PATCH(
    new Request('http://localhost/api/dashboard/access', { method: 'PATCH' }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { message: expect.stringContaining('Event assignments have been removed') },
  });
  expect(requireRole).toHaveBeenCalledWith('ADMIN');
});

it.each([new UnauthorizedError('Sign in.'), new ForbiddenError('Not allowed.')])(
  'retains authentication and role checks: %s',
  async (error) => {
    vi.mocked(requireRole).mockRejectedValue(error);
    const response = await PATCH(
      new Request('http://localhost/api/dashboard/access', { method: 'PATCH' }),
    );
    expect(response.status).toBe(error.statusCode);
  },
);
