import { describe, expect, it } from 'vitest';

import { authorizeRealtimeChannels, parseRealtimeChannel } from './channel-authorization';

const visitorChannel = 'visitor:site-a:11111111-1111-4111-8111-111111111111';

describe('realtime channel authorization', () => {
  it('parses only supported call, site, and visitor channel formats', () => {
    expect(parseRealtimeChannel('call:call-a')).toEqual({ callId: 'call-a', type: 'call' });
    expect(parseRealtimeChannel('chat:thread-a')).toEqual({ threadId: 'thread-a', type: 'chat' });
    expect(parseRealtimeChannel('site:site-a')).toEqual({ siteId: 'site-a', type: 'site' });
    expect(parseRealtimeChannel(visitorChannel)).toEqual({
      anonymousVisitorId: '11111111-1111-4111-8111-111111111111',
      siteId: 'site-a',
      type: 'visitor',
    });
    expect(parseRealtimeChannel('site:site-a:extra')).toBeUndefined();
  });

  it('does not allow a visitor to subscribe to another visitor channel', async () => {
    await expect(
      authorizeRealtimeChannels(['visitor:site-a:22222222-2222-4222-8222-222222222222'], {
        authorizeDashboardSite: async () => false,
        authorizeDashboardCall: async () => false,
        authorizeDashboardChat: async () => false,
        visitorChannel,
      }),
    ).resolves.toBe(false);
  });

  it('does not allow an agent without site access to subscribe to the site channel', async () => {
    await expect(
      authorizeRealtimeChannels(['site:site-a'], {
        authorizeDashboardSite: async () => false,
        authorizeDashboardCall: async () => false,
        authorizeDashboardChat: async () => false,
        visitorChannel: undefined,
      }),
    ).resolves.toBe(false);
  });

  it('requires site access before a dashboard can subscribe to a call', async () => {
    await expect(
      authorizeRealtimeChannels(['call:call-a'], {
        authorizeDashboardCall: async () => false,
        authorizeDashboardChat: async () => false,
        authorizeDashboardSite: async () => false,
        visitorChannel: undefined,
      }),
    ).resolves.toBe(false);
  });

  it('allows a dashboard subscription after site access is confirmed', async () => {
    await expect(
      authorizeRealtimeChannels(['site:site-a'], {
        authorizeDashboardSite: async (siteId) => siteId === 'site-a',
        authorizeDashboardCall: async () => false,
        authorizeDashboardChat: async () => false,
        visitorChannel: undefined,
      }),
    ).resolves.toBe(true);
  });

  it('allows a visitor only on the exact signed chat channel', async () => {
    await expect(
      authorizeRealtimeChannels(['chat:thread-b'], {
        authorizeDashboardChat: async () => false,
        authorizeDashboardSite: async () => false,
        authorizeDashboardCall: async () => false,
        visitorChannel: 'chat:thread-a',
      }),
    ).resolves.toBe(false);
    await expect(
      authorizeRealtimeChannels(['chat:thread-a'], {
        authorizeDashboardChat: async () => false,
        authorizeDashboardSite: async () => false,
        authorizeDashboardCall: async () => false,
        visitorChannel: 'chat:thread-a',
      }),
    ).resolves.toBe(true);
  });
});
