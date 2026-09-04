import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { listChatInboxThreads } from '@/server/services/chat-service';

import { GET } from './route';

vi.mock('@/server/auth/access', () => ({
  requireRole: vi.fn(),
  requireSiteAccess: vi.fn(),
}));
vi.mock('@/server/auth/roles', () => ({ assertRole: vi.fn() }));
vi.mock('@/server/services/chat-service', () => ({
  listChatInboxThreads: vi.fn(),
  resolveOrCreateChatThread: vi.fn(),
}));

describe('GET /api/chat/threads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the authorized site inbox with a bounded default page size', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      email: 'agent@example.com',
      id: 'agent_1',
      name: 'Agent',
      role: 'AGENT',
    });
    vi.mocked(requireSiteAccess).mockResolvedValue({
      siteId: 'site_123',
      siteRole: 'AGENT',
      user: {
        email: 'agent@example.com',
        id: 'agent_1',
        name: 'Agent',
        role: 'AGENT',
      },
    });
    vi.mocked(listChatInboxThreads).mockResolvedValue([]);

    const response = await GET(new Request('http://localhost/api/chat/threads?siteId=site_123'));

    expect(response.status).toBe(200);
    expect(assertRole).toHaveBeenCalledWith('AGENT', ['ADMIN', 'AGENT']);
    expect(listChatInboxThreads).toHaveBeenCalledWith('site_123', 25);
  });
});
