import { describe, expect, it } from 'vitest';

import { resolveApplicationEndpoint, resolveBootstrapEndpoint } from './platform-url';

describe('platform URLs', () => {
  it('derives the base path from the tracker script URL', () => {
    expect(
      resolveBootstrapEndpoint(
        'https://api.infrastructuresg.com/autocall-db/sdk/tracker.js?version=1',
      ),
    ).toBe('https://api.infrastructuresg.com/autocall-db/api/track/bootstrap');
  });

  it('keeps subsequent API and widget URLs under the application base path', () => {
    const bootstrapEndpoint = 'https://api.infrastructuresg.com/autocall-db/api/track/bootstrap';
    const paths = [
      '/api/calls/call-id/accept',
      '/api/chat/threads/thread-id/messages',
      '/api/chat/visitor/thread',
      '/api/livekit/token',
      '/api/realtime',
      '/api/track/heartbeat',
      '/widget/call',
      '/widget/chat',
    ];

    for (const path of paths) {
      expect(resolveApplicationEndpoint(bootstrapEndpoint, path)).toBe(
        `https://api.infrastructuresg.com/autocall-db${path}`,
      );
    }
  });

  it('preserves root-hosted behavior when no base path is present', () => {
    expect(
      resolveApplicationEndpoint('https://platform.example/api/track/bootstrap', '/api/calls'),
    ).toBe('https://platform.example/api/calls');
  });
});
