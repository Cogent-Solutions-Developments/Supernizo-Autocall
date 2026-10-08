import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireRole, requireSiteAccess } from '@/server/interfaces/auth/access';
import { getChatThreadScope } from '@/server/composition/chat/chat-service';
import {
  getChatFollowUp,
  updateChatFollowUp,
} from '@/server/composition/chat/chat-contact-service';
import { ForbiddenError, UnauthorizedError } from '@/server/domain/errors/app-error';
import { GET, PATCH } from './route';
vi.mock('@/server/interfaces/auth/access', () => ({
  requireRole: vi.fn(),
  requireSiteAccess: vi.fn(),
}));
vi.mock('@/server/composition/chat/chat-service', () => ({ getChatThreadScope: vi.fn() }));
vi.mock('@/server/composition/chat/chat-contact-service', () => ({
  getChatFollowUp: vi.fn(),
  updateChatFollowUp: vi.fn(),
}));
const context = { params: Promise.resolve({ threadId: 'thread-a' }) };
const user = {
  id: 'agent-a',
  email: 'staff@example.com',
  name: 'Staff',
  role: 'AGENT' as const,
  signInMethod: 'supernizo' as const,
};
const details = { status: 'NEEDS_REPLY' as const, contact: null };
describe('staff-only chat follow-up API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(user);
    vi.mocked(getChatThreadScope).mockResolvedValue({ siteId: 'site-a', visitorId: 'visitor-a' });
    vi.mocked(requireSiteAccess).mockResolvedValue({ siteId: 'site-a', siteRole: 'AGENT', user });
    vi.mocked(getChatFollowUp).mockResolvedValue(details);
    vi.mocked(updateChatFollowUp).mockResolvedValue({ ...details, status: 'RESOLVED' });
  });
  it('requires authentication and site access before reading private details', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError('Sign in'));
    expect(
      (await GET(new Request('http://localhost/api/chat/threads/thread-a/follow-up'), context))
        .status,
    ).toBe(401);
    expect(getChatFollowUp).not.toHaveBeenCalled();
    vi.mocked(requireSiteAccess).mockRejectedValueOnce(new ForbiddenError('Denied'));
    expect(
      (await GET(new Request('http://localhost/api/chat/threads/thread-a/follow-up'), context))
        .status,
    ).toBe(403);
    expect(getChatFollowUp).not.toHaveBeenCalled();
  });
  it('returns private, non-cacheable follow-up details', async () => {
    const response = await GET(
      new Request('http://localhost/api/chat/threads/thread-a/follow-up'),
      context,
    );
    expect(response.status).toBe(200);
    expect(requireSiteAccess).toHaveBeenCalledWith('site-a');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('validates status updates and rejects unknown fields as statuses', async () => {
    const make = (body: string) =>
      new Request('http://localhost/api/chat/threads/thread-a/follow-up', {
        method: 'PATCH',
        body,
      });
    expect((await PATCH(make(JSON.stringify({ status: 'UNKNOWN' })), context)).status).toBe(400);
    expect((await PATCH(make('{'), context)).status).toBe(400);
    expect(updateChatFollowUp).not.toHaveBeenCalled();
    expect((await PATCH(make(JSON.stringify({ status: 'RESOLVED' })), context)).status).toBe(200);
    expect(updateChatFollowUp).toHaveBeenCalledWith('thread-a', 'RESOLVED');
  });
});
