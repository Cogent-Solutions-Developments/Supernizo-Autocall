import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole } from '@/server/auth/access';
import { listNotificationsForUser } from '@/server/services/notification-service';

import { GET } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({
  listNotificationsForUser: vi.fn(),
}));

describe('GET /api/notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only the authenticated user notifications', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      email: 'agent@example.com',
      id: 'agent-1',
      name: 'Agent',
      role: 'AGENT',
      signInMethod: 'supernizo',
    });
    vi.mocked(listNotificationsForUser).mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/notifications?limit=25&unreadOnly=true'),
    );

    expect(response.status).toBe(200);
    expect(listNotificationsForUser).toHaveBeenCalledWith('agent-1', {
      limit: 25,
      unreadOnly: true,
    });
  });

  it('rejects an invalid notification query', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      email: 'agent@example.com',
      id: 'agent-1',
      name: 'Agent',
      role: 'AGENT',
      signInMethod: 'supernizo',
    });

    const response = await GET(new Request('http://localhost/api/notifications?limit=1000'));

    expect(response.status).toBe(400);
    expect(listNotificationsForUser).not.toHaveBeenCalled();
  });
});
