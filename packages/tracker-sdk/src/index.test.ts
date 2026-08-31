import { describe, expect, it, vi } from 'vitest';

import { createTracker, resolveTrackerIdentifiers } from './index';

function createMemoryStorage() {
  const visitorValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();

  return {
    getSession: (key: string) => sessionValues.get(key) ?? null,
    getVisitor: (key: string) => visitorValues.get(key) ?? null,
    setSession: (key: string, value: string) => sessionValues.set(key, value),
    setVisitor: (key: string, value: string) => visitorValues.set(key, value),
  };
}

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

describe('resolveTrackerIdentifiers', () => {
  it('persists visitor and session identifiers for repeated loads in one tab', () => {
    const storage = createMemoryStorage();
    const identifiers = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    let index = 0;
    const createIdentifier = () => identifiers[index++];

    const firstLoad = resolveTrackerIdentifiers(storage, 'site_public_demo', createIdentifier);
    const repeatedLoad = resolveTrackerIdentifiers(storage, 'site_public_demo', createIdentifier);

    expect(firstLoad).toEqual({
      sessionId: '22222222-2222-4222-8222-222222222222',
      visitorId: '11111111-1111-4111-8111-111111111111',
    });
    expect(repeatedLoad).toEqual(firstLoad);
  });

  it('keeps a visitor ID but creates a new session ID for a new browser session', () => {
    const firstSessionStorage = createMemoryStorage();
    const secondSessionStorage = createMemoryStorage();
    const visitorId = '11111111-1111-4111-8111-111111111111';
    const firstSessionId = '22222222-2222-4222-8222-222222222222';
    const secondSessionId = '33333333-3333-4333-8333-333333333333';

    const firstIdentifiers = [visitorId, firstSessionId];
    let firstIndex = 0;
    const firstLoad = resolveTrackerIdentifiers(
      firstSessionStorage,
      'site_public_demo',
      () => firstIdentifiers[firstIndex++],
    );
    secondSessionStorage.setVisitor('supernizo_visitor_id:site_public_demo', visitorId);
    const secondLoad = resolveTrackerIdentifiers(
      secondSessionStorage,
      'site_public_demo',
      () => secondSessionId,
    );

    expect(firstLoad?.visitorId).toBe(visitorId);
    expect(firstLoad?.sessionId).toBe(firstSessionId);
    expect(secondLoad).toEqual({ sessionId: secondSessionId, visitorId });
  });
});
