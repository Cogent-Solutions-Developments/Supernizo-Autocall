import { describe, expect, it } from 'vitest';

import {
  ActiveTimeAccumulator,
  hasNavigationChanged,
  sanitizeEventMetadata,
  SerialRequestQueue,
  sendAfterPageRegistration,
  serializeBeaconPayload,
} from './engagement';

describe('ActiveTimeAccumulator', () => {
  it('stops accumulating while the page is hidden and resumes after user activity', () => {
    const timer = new ActiveTimeAccumulator(0, true);

    expect(timer.drainWholeSeconds(30_000)).toBe(30);
    timer.setVisibility(false, 30_000);
    expect(timer.drainWholeSeconds(330_000)).toBe(0);

    timer.setVisibility(true, 330_000);
    timer.recordActivity(331_000);
    expect(timer.drainWholeSeconds(346_000)).toBe(15);
  });

  it('caps a heartbeat delta when the visitor becomes idle', () => {
    const timer = new ActiveTimeAccumulator(0, true);

    expect(timer.drainWholeSeconds(300_000)).toBe(60);
    expect(timer.drainWholeSeconds(315_000)).toBe(0);
  });
});

describe('engagement helpers', () => {
  it('detects SPA navigation only when the URL changes', () => {
    expect(hasNavigationChanged('https://example.com/pricing', 'https://example.com/contact')).toBe(
      true,
    );
    expect(hasNavigationChanged('https://example.com/pricing', 'https://example.com/pricing')).toBe(
      false,
    );
  });

  it('waits for a page view to be registered before sending page-scoped activity', async () => {
    let resolveRegistration: ((value: boolean) => void) | undefined;
    const registration = new Promise<boolean>((resolve) => {
      resolveRegistration = resolve;
    });
    const sent: string[] = [];
    const queued = sendAfterPageRegistration(registration, async () => {
      sent.push('heartbeat');
      return true;
    });

    expect(sent).toEqual([]);
    resolveRegistration?.(true);
    await expect(queued).resolves.toBe(true);
    expect(sent).toEqual(['heartbeat']);
  });

  it('serializes requests even when several are queued together', async () => {
    const queue = new SerialRequestQueue();
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sent: string[] = [];

    const first = queue.enqueue(async () => {
      sent.push('first:start');
      await firstBlocked;
      sent.push('first:end');
    });
    const second = queue.enqueue(async () => {
      sent.push('second');
    });

    await Promise.resolve();
    expect(sent).toEqual(['first:start']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(sent).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues processing after a queued request fails', async () => {
    const queue = new SerialRequestQueue();
    const first = queue.enqueue(async () => {
      throw new Error('Request failed');
    });
    const second = queue.enqueue(async () => 'sent');

    await expect(first).rejects.toThrow('Request failed');
    await expect(second).resolves.toBe('sent');
  });

  it('serializes a text/plain beacon payload', async () => {
    const payload = serializeBeaconPayload({ pageViewId: 'page-1', value: 3 });

    expect(payload.type).toBe('text/plain;charset=utf-8');
    await expect(payload.text()).resolves.toBe('{"pageViewId":"page-1","value":3}');
  });

  it('accepts only small scalar custom-event metadata', () => {
    expect(
      sanitizeEventMetadata({
        accepted: true,
        ignored: ['form input'],
        plan: 'enterprise',
        score: 10,
      }),
    ).toEqual({ accepted: true, plan: 'enterprise', score: 10 });
  });
});
