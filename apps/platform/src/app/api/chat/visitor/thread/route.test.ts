import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handlePublicChatQuery, handlePublicChatRequest } from '@/server/chat/public-route';
import { startVisitorChat } from '@/server/services/chat-service';

import { POST } from './route';

vi.mock('@/server/chat/public-route', () => ({
  handlePublicChatQuery: vi.fn(),
  handlePublicChatRequest: vi.fn(),
}));
vi.mock('@/server/services/chat-service', () => ({
  getVisitorChatThread: vi.fn(),
  startVisitorChat: vi.fn(),
}));

describe('POST /api/chat/visitor/thread', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the public chat guard and starts a visitor-initiated chat', async () => {
    const request = new Request('https://platform.example/api/chat/visitor/thread', {
      body: JSON.stringify({ content: 'I need help', context: {} }),
      method: 'POST',
    });
    const startedThread = {
      history: { messages: [], nextCursor: null },
      realtime: { channel: 'chat:thread_123', token: 'visitor-token' },
      thread: { id: 'thread_123', siteId: 'site_123', visitorId: 'visitor_123' },
    };
    vi.mocked(startVisitorChat).mockResolvedValue(startedThread);
    vi.mocked(handlePublicChatRequest).mockImplementation(
      async (_request, _schema, _bucket, handler) =>
        handler({
          origin: 'https://tracked.example',
          payload: {
            content: 'I need help',
            context: {
              sessionId: 'session_123',
              sitePublicKey: 'site_public_123',
              visitorId: 'visitor_123',
            },
          },
        }),
    );

    const response = await POST(request);

    expect(handlePublicChatQuery).not.toHaveBeenCalled();
    expect(handlePublicChatRequest).toHaveBeenCalledWith(
      request,
      expect.anything(),
      'chat-thread-start',
      expect.any(Function),
    );
    expect(startVisitorChat).toHaveBeenCalledWith(
      'https://tracked.example',
      {
        sessionId: 'session_123',
        sitePublicKey: 'site_public_123',
        visitorId: 'visitor_123',
      },
      'I need help',
    );
    expect(await response.json()).toEqual({ data: startedThread });
  });
});
