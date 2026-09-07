import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/server/auth/access';
import { ForbiddenError } from '@/server/errors/app-error';

import { POST } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));

describe('POST /api/dashboard/access/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not allow Autocall user creation', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      email: 'admin@example.com',
      id: 'admin_1',
      name: 'Admin',
      role: 'ADMIN',
      signInMethod: 'supernizo',
    });

    const response = await POST(
      new Request('http://localhost/api/dashboard/access/users', { method: 'POST' }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'User management is handled in Supernizo.' },
    });
    expect(response.status).toBe(403);
  });

  it('keeps the endpoint protected', async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError('Not allowed.'));

    const response = await POST(
      new Request('http://localhost/api/dashboard/access/users', { method: 'POST' }),
    );

    expect(response.status).toBe(403);
  });
});
