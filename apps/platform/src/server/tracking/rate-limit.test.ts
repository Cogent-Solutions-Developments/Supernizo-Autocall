import { describe, expect, it } from 'vitest';

import { RateLimitError } from '@/server/errors/app-error';

import { enforceTrackingRateLimit } from './rate-limit';

describe('tracking rate limits', () => {
  it('rejects chat spam after the configured request window is exhausted', async () => {
    const origin = `https://chat-rate-limit-${Date.now()}.example.test`;

    for (let index = 0; index < 60; index += 1) {
      await expect(enforceTrackingRateLimit(origin, 'chat-message')).resolves.toBeUndefined();
    }

    await expect(enforceTrackingRateLimit(origin, 'chat-message')).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});
