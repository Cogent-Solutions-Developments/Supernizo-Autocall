import { describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/server/errors/app-error';

import {
  assertTrackingContextRelationships,
  isRetryableTrackingWriteError,
  retryTrackingWrite,
} from './tracker-engagement-service';

describe('assertTrackingContextRelationships', () => {
  it('rejects a visitor and session mismatch', () => {
    expect(() =>
      assertTrackingContextRelationships({
        sessionSiteId: 'site-a',
        sessionVisitorId: 'visitor-b',
        siteId: 'site-a',
        visitorId: 'visitor-a',
        visitorSiteId: 'site-a',
      }),
    ).toThrow(ConflictError);
  });

  it('accepts a context whose site, visitor, and session agree', () => {
    expect(() =>
      assertTrackingContextRelationships({
        sessionSiteId: 'site-a',
        sessionVisitorId: 'visitor-a',
        siteId: 'site-a',
        visitorId: 'visitor-a',
        visitorSiteId: 'site-a',
      }),
    ).not.toThrow();
  });
});

describe('tracking write retries', () => {
  it('retries a transient MySQL write conflict with bounded backoff', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error('Write conflict'), { code: 'P2034' }))
      .mockResolvedValue('saved');
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(retryTrackingWrite(operation, wait)).resolves.toBe('saved');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25);
  });

  it('does not retry an expired transaction because its commit result may be ambiguous', async () => {
    const error = Object.assign(new Error('Expired transaction'), { code: 'P2028' });
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    expect(isRetryableTrackingWriteError(error)).toBe(false);
    await expect(retryTrackingWrite(operation, wait)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('stops after two retries when write conflicts continue', async () => {
    const error = Object.assign(new Error('Write conflict'), { code: 'P2034' });
    const operation = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(retryTrackingWrite(operation, wait)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[25], [75]]);
  });
});
