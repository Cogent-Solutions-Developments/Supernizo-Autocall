import { describe, expect, it } from 'vitest';
import {
  VISITOR_PRESENCE_TIMEOUT_MS,
  getChatAgentIdentity,
  type ChatMessage,
} from '@supernizo/shared';
import { CHAT_IDENTITY_TIMEOUT_MS, ChatIdentitySession } from './chat-identity-session';

const start = '2026-10-09T10:00:00.000Z';
const now = Date.parse(start);
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('chat header session', () => {
  it('matches the visitor presence timeout', () => {
    expect(CHAT_IDENTITY_TIMEOUT_MS).toBe(VISITOR_PRESENCE_TIMEOUT_MS);
  });
  it('keeps an active agent identity through polling and a page refresh', () => {
    const storage = memoryStorage();
    const session = new ChatIdentitySession('session_1', start, storage, now);
    expect(session.currentStart(true, now + 30_000)).toBe(start);
    expect(session.currentStart(true, now + 60_000)).toBe(start);
    const refreshed = new ChatIdentitySession('session_1', start, storage, now + 70_000);
    expect(refreshed.currentStart(true, now + 70_000)).toBe(start);
  });

  it('resets after a hidden interval and keeps the reset through a refresh', () => {
    const storage = memoryStorage();
    const session = new ChatIdentitySession('session_1', start, storage, now);
    session.currentStart(true, now);
    session.currentStart(false, now + 30_000);
    const returnedAt = now + VISITOR_PRESENCE_TIMEOUT_MS;
    const boundary = new Date(returnedAt).toISOString();
    expect(session.currentStart(true, returnedAt)).toBe(boundary);
    const refreshed = new ChatIdentitySession('session_1', start, storage, returnedAt + 1_000);
    expect(refreshed.currentStart(true, returnedAt + 1_000)).toBe(boundary);
  });

  it('resets when a closed page is reopened with the same tracker session', () => {
    const storage = memoryStorage();
    new ChatIdentitySession('session_1', start, storage, now).currentStart(true, now);
    const returnedAt = now + VISITOR_PRESENCE_TIMEOUT_MS + 1;
    const reopened = new ChatIdentitySession('session_1', start, storage, returnedAt);
    expect(reopened.currentStart(true, returnedAt)).toBe(new Date(returnedAt).toISOString());
  });

  it('keeps session boundaries separate for new visits and sites', () => {
    const storage = memoryStorage();
    const returnedAt = now + VISITOR_PRESENCE_TIMEOUT_MS;
    new ChatIdentitySession('site_a:session_1', start, storage, now).currentStart(true, returnedAt);
    expect(
      new ChatIdentitySession('site_b:session_1', start, storage, returnedAt).currentStart(
        true,
        returnedAt,
      ),
    ).toBe(start);
    const nextStart = new Date(returnedAt).toISOString();
    expect(
      new ChatIdentitySession('site_a:session_2', nextStart, storage, returnedAt).currentStart(
        true,
        returnedAt,
      ),
    ).toBe(nextStart);
  });

  it('restores Swetha after expiry and changes only after a fresh agent reply', () => {
    const session = new ChatIdentitySession('session_1', start, undefined, now);
    const returnedAt = now + VISITOR_PRESENCE_TIMEOUT_MS;
    const boundary = session.currentStart(true, returnedAt);
    const oldReply: ChatMessage = {
      id: 'old',
      threadId: 'thread',
      senderType: 'AGENT',
      senderName: 'Alice',
      senderAvatarUrl: 'https://example.com/alice.png',
      content: 'Hello',
      sentAt: start,
    };
    expect(getChatAgentIdentity([oldReply], boundary)).toBeNull();
    const newReply: ChatMessage = {
      ...oldReply,
      id: 'new',
      senderName: 'Bob',
      sentAt: new Date(returnedAt + 1_000).toISOString(),
    };
    expect(getChatAgentIdentity([oldReply, newReply], boundary)).toEqual({
      displayName: 'Bob',
      imageUrl: oldReply.senderAvatarUrl,
    });
  });

  it('works with blocked or invalid session storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    };
    expect(new ChatIdentitySession('session', start, blocked, now).currentStart(true, now)).toBe(
      start,
    );
    const storage = memoryStorage();
    storage.setItem('session:start', 'invalid');
    storage.setItem('session:last_seen', 'invalid');
    expect(new ChatIdentitySession('session', start, storage, now).currentStart(true, now)).toBe(
      start,
    );
  });
});
