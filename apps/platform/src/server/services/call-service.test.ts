import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/server/errors/app-error';

import {
  buildCallParticipantLockQueries,
  getConnectionTimeoutSeconds,
  getRingTimeoutSeconds,
  isRingingCallExpired,
  staleCallAction,
  transitionCallStatus,
} from './call-service';

describe('call state machine', () => {
  it('uses PostgreSQL identifier quoting when locking call participants', () => {
    const [agentLock, visitorLock] = buildCallParticipantLockQueries('agent-1', 'visitor-1');

    expect(agentLock.text).toBe('SELECT id FROM "User" WHERE id = $1 FOR UPDATE');
    expect(agentLock.values).toEqual(['agent-1']);
    expect(visitorLock.text).toBe('SELECT id FROM "Visitor" WHERE id = $1 FOR UPDATE');
    expect(visitorLock.values).toEqual(['visitor-1']);
  });

  it.each([
    ['RINGING', 'accept', 'ACCEPTED'],
    ['RINGING', 'reject', 'REJECTED'],
    ['RINGING', 'cancel', 'CANCELLED'],
    ['RINGING', 'timeout', 'MISSED'],
    ['RINGING', 'fail', 'FAILED'],
    ['ACCEPTED', 'end', 'ENDED'],
  ] as const)('transitions %s through %s to %s', (current, action, expected) => {
    expect(transitionCallStatus(current, action)).toBe(expected);
  });

  it('is idempotent for a repeated terminal action', () => {
    expect(transitionCallStatus('REJECTED', 'reject')).toBe('REJECTED');
  });

  it('rejects illegal transitions', () => {
    expect(() => transitionCallStatus('RINGING', 'end')).toThrow(ConflictError);
    expect(() => transitionCallStatus('ACCEPTED', 'reject')).toThrow(ConflictError);
    expect(() => transitionCallStatus('CANCELLED', 'accept')).toThrow(ConflictError);
  });

  it('uses a bounded 30-second default timeout', () => {
    expect(getRingTimeoutSeconds({})).toBe(30);
    expect(getRingTimeoutSeconds({ CALL_RING_TIMEOUT_SECONDS: '45' })).toBe(45);
    expect(getRingTimeoutSeconds({ CALL_RING_TIMEOUT_SECONDS: '2' })).toBe(30);
  });

  it('uses a bounded timeout for calls that never complete media connection', () => {
    expect(getConnectionTimeoutSeconds({})).toBe(90);
    expect(getConnectionTimeoutSeconds({ CALL_CONNECTION_TIMEOUT_SECONDS: '120' })).toBe(120);
    expect(getConnectionTimeoutSeconds({ CALL_CONNECTION_TIMEOUT_SECONDS: '10' })).toBe(90);
  });

  it('recognizes when a ringing call has exceeded its timeout', () => {
    const requestedAt = new Date('2026-08-31T10:00:00.000Z');
    expect(isRingingCallExpired(requestedAt, requestedAt.getTime() + 29_999, 30)).toBe(false);
    expect(isRingingCallExpired(requestedAt, requestedAt.getTime() + 30_000, 30)).toBe(true);
  });

  it('reconciles stale ringing and media-connection states into terminal outcomes', () => {
    expect(staleCallAction('RINGING')).toBe('timeout');
    expect(staleCallAction('CONNECTING')).toBe('fail');
    expect(staleCallAction('ACTIVE')).toBe('fail');
    expect(staleCallAction('ENDED')).toBeNull();
  });
});
