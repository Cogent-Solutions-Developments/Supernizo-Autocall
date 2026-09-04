import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/server/errors/app-error';
import { requireRole } from '@/server/auth/access';
import { createManagedUser } from '@/server/services/access-management-service';

import { POST } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/access-management-service', () => ({ createManagedUser: vi.fn() }));

const administrator = {
  email: 'admin@example.com',
  id: 'admin_1',
  name: 'Admin',
  role: 'ADMIN' as const,
};

const createdUser = {
  createdAt: '2026-09-04T00:00:00.000Z',
  displayName: 'Agent One',
  email: 'agent@example.com',
  id: 'agent_1',
  role: 'AGENT' as const,
  siteIds: ['site_1'],
  updatedAt: '2026-09-04T00:00:00.000Z',
};

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/dashboard/access/users', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

describe('POST /api/dashboard/access/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a non-administrator before creating a user', async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError('Not allowed.'));

    const response = await POST(
      createRequest({
        displayName: 'Agent One',
        email: 'agent@example.com',
        password: 'a-secure-password',
        role: 'AGENT',
        siteIds: ['site_1'],
      }),
    );

    expect(response.status).toBe(403);
    expect(createManagedUser).not.toHaveBeenCalled();
  });

  it('validates and creates an agent as an administrator', async () => {
    vi.mocked(requireRole).mockResolvedValue(administrator);
    vi.mocked(createManagedUser).mockResolvedValue(createdUser);

    const response = await POST(
      createRequest({
        displayName: 'Agent One',
        email: ' AGENT@EXAMPLE.COM ',
        password: 'a-secure-password',
        role: 'AGENT',
        siteIds: ['site_1'],
      }),
    );

    expect(response.status).toBe(201);
    expect(createManagedUser).toHaveBeenCalledWith(
      administrator.id,
      expect.objectContaining({ email: 'agent@example.com', role: 'AGENT' }),
    );
    await expect(response.json()).resolves.toMatchObject({ data: createdUser });
  });

  it('rejects the removed viewer role', async () => {
    vi.mocked(requireRole).mockResolvedValue(administrator);

    const response = await POST(
      createRequest({
        displayName: 'Legacy Viewer',
        email: 'viewer@example.com',
        password: 'a-secure-password',
        role: 'VIEWER',
        siteIds: [],
      }),
    );

    expect(response.status).toBe(400);
    expect(createManagedUser).not.toHaveBeenCalled();
  });
});
