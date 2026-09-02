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
    expect(
      resolveApplicationEndpoint(
        'https://api.infrastructuresg.com/autocall-db/api/track/bootstrap',
        '/widget/chat',
      ),
    ).toBe('https://api.infrastructuresg.com/autocall-db/widget/chat');
  });

  it('preserves root-hosted behavior when no base path is present', () => {
    expect(
      resolveApplicationEndpoint('https://platform.example/api/track/bootstrap', '/api/calls'),
    ).toBe('https://platform.example/api/calls');
  });
});
