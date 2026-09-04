import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/server/auth/access';
import { ForbiddenError } from '@/server/errors/app-error';
import { listAccessManagement } from '@/server/services/access-management-service';

import { GET } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/access-management-service', () => ({ listAccessManagement: vi.fn() }));

describe('GET /api/dashboard/access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-administrators', async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError('Not allowed.'));

    const response = await GET(new Request('http://localhost/api/dashboard/access'));

    expect(response.status).toBe(403);
    expect(listAccessManagement).not.toHaveBeenCalled();
  });

  it('returns access data to administrators without password fields', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      email: 'admin@example.com',
      id: 'admin_1',
      name: 'Admin',
      role: 'ADMIN',
    });
    vi.mocked(listAccessManagement).mockResolvedValue({
      sites: [{ id: 'site_1', name: 'Event One' }],
      users: [
        {
          createdAt: '2026-09-04T00:00:00.000Z',
          displayName: 'Admin',
          email: 'admin@example.com',
          id: 'admin_1',
          role: 'ADMIN',
          siteIds: [],
          updatedAt: '2026-09-04T00:00:00.000Z',
        },
      ],
    });

    const response = await GET(new Request('http://localhost/api/dashboard/access'));
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('data.users.0.passwordHash');
  });
});
