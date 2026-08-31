import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/server/errors/app-error';

import {
  getConnectionTimeoutSeconds,
  getRingTimeoutSeconds,
  isRingingCallExpired,
  transitionCallStatus,
} from './call-service';

describe('call state machine', () => {
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
});
