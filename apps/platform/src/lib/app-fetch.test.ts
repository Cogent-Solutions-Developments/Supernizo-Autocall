import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAppApi } from './app-fetch';

describe('fetchAppApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always sends browser API requests through the configured application base path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAppApi('/api/dashboard/agent-presence', {
      method: 'POST',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/autocall-db/api/dashboard/agent-presence',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
