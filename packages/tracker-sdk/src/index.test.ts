import { describe, expect, it, vi } from 'vitest';

import { createTracker } from './index';

describe('createTracker', () => {
  it('sends a validated event payload using fetch outside a browser', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetchMock);

    const tracker = createTracker({
      endpoint: 'https://example.com/api/track',
      sitePublicKey: 'site_public_123',
    });

    tracker.track({
      type: 'page_view',
      name: 'page_view',
      occurredAt: '2026-08-31T08:00:00.000Z',
      properties: {},
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/track',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});
