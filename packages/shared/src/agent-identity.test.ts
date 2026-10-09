import { describe, expect, it } from 'vitest';
import { getAgentIdentity, getChatAgentIdentity } from './agent-identity';
import type { ChatMessage } from './contracts';

const message: ChatMessage = {
  id: 'message_1',
  content: 'Hello',
  senderType: 'AGENT',
  senderName: 'Alice',
  senderAvatarUrl: 'https://example.com/alice.png',
  sentAt: '2026-10-09T10:00:00.000Z',
  threadId: 'thread_1',
};

describe('widget agent identity', () => {
  it('uses the saved profile before the directory identity', () => {
    expect(
      getAgentIdentity({
        displayName: 'Directory name',
        profile: { displayName: 'Alice', imageUrl: message.senderAvatarUrl ?? null },
      }),
    ).toEqual({ displayName: 'Alice', imageUrl: message.senderAvatarUrl });
  });
  it('uses the actual directory name when no profile is saved', () => {
    expect(getAgentIdentity({ displayName: 'Local Admin' })).toEqual({
      displayName: 'Local Admin',
      imageUrl: null,
    });
    expect(getAgentIdentity(null)).toBeNull();
  });
  it('shows the latest agent even after visitor and system messages', () => {
    expect(
      getChatAgentIdentity([
        message,
        { ...message, id: 'message_2', senderName: 'Bob', senderAvatarUrl: null },
        { ...message, senderType: 'VISITOR' },
        { ...message, senderType: 'SYSTEM' },
      ]),
    ).toEqual({ displayName: 'Bob', imageUrl: null });
  });
  it('ignores historical agent replies when a returning visitor starts a new session', () => {
    const sessionStartedAt = '2026-10-09T11:00:00.000Z';
    expect(getChatAgentIdentity([message], sessionStartedAt)).toBeNull();
    const visitorMessage: ChatMessage = {
      ...message,
      id: 'visitor_new',
      senderType: 'VISITOR',
      sentAt: sessionStartedAt,
    };
    expect(getChatAgentIdentity([message, visitorMessage], sessionStartedAt)).toBeNull();
    const reply: ChatMessage = {
      ...message,
      id: 'agent_new',
      senderName: 'Bob',
      senderAvatarUrl: null,
      sentAt: '2026-10-09T11:00:01.000Z',
    };
    expect(getChatAgentIdentity([message, visitorMessage, reply], sessionStartedAt)).toEqual({
      displayName: 'Bob',
      imageUrl: null,
    });
    expect(getChatAgentIdentity([message], message.sentAt)).toEqual({
      displayName: 'Alice',
      imageUrl: message.senderAvatarUrl,
    });
  });
  it('keeps the Swetha presentation until the first agent message, including after a visitor message', () => {
    expect(getChatAgentIdentity([])).toBeNull();
    const visitorMessage: ChatMessage = { ...message, senderType: 'VISITOR' };
    expect(getChatAgentIdentity([visitorMessage])).toBeNull();
    expect(getChatAgentIdentity([visitorMessage, message])).toEqual({
      displayName: 'Alice',
      imageUrl: message.senderAvatarUrl,
    });
  });
});
