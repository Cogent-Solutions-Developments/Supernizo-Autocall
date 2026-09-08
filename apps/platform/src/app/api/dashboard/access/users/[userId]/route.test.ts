import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/server/auth/access';
import { updateAgentEventAssignments } from '@/server/services/access-management-service';

import { PATCH } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/access-management-service', () => ({
  updateAgentEventAssignments: vi.fn(),
}));

const administrator = {
  signInMethod: 'local' as const,
  email: 'admin@example.com',
  id: 'admin_1',
  name: 'Admin',
  role: 'ADMIN' as const,
};

function updateRequest(body: unknown): Request {
  return new Request('http://localhost/api/dashboard/access/users/agent_1', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  });
}

describe('PATCH /api/dashboard/access/users/[userId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a validated agent assignment', async () => {
    const updatedUser = {
      createdAt: '2026-09-04T00:00:00.000Z',
      displayName: 'Agent One',
      email: 'agent@example.com',
      id: 'agent_1',
      role: 'AGENT' as const,
      siteIds: ['site_1'],
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    vi.mocked(requireRole).mockResolvedValue(administrator);
    vi.mocked(updateAgentEventAssignments).mockResolvedValue(updatedUser);

    const response = await PATCH(updateRequest({ siteIds: ['site_1'] }), {
      params: Promise.resolve({ userId: 'agent_1' }),
    });

    expect(response.status).toBe(200);
    expect(updateAgentEventAssignments).toHaveBeenCalledWith(administrator.id, 'agent_1', [
      'site_1',
    ]);
  });

  it('rejects attempts to manage roles or names', async () => {
    vi.mocked(requireRole).mockResolvedValue(administrator);

    const response = await PATCH(
      updateRequest({ displayName: 'Agent One', role: 'AGENT', siteIds: [] }),
      { params: Promise.resolve({ userId: 'agent_1' }) },
    );

    expect(response.status).toBe(400);
    expect(updateAgentEventAssignments).not.toHaveBeenCalled();
  });
});
