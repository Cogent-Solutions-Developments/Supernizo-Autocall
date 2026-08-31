import { describe, expect, it } from 'vitest';

import { mergeChatMessage } from './chat-state';

describe('mergeChatMessage', () => {
  it('keeps message content as plain text and does not duplicate realtime echoes', () => {
    const message = {
      content: '<img src=x onerror=alert(1)>',
      id: 'message-a',
      senderName: 'Visitor',
      senderType: 'VISITOR' as const,
      sentAt: '2026-08-31T12:00:00.000Z',
      threadId: 'thread-a',
    };

    expect(mergeChatMessage([], message)).toEqual([message]);
    expect(mergeChatMessage([message], message)).toEqual([message]);
  });
});
