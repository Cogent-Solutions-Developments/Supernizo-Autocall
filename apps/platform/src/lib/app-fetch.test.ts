import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_SESSION_REJECTED, fetchAppApi } from './app-fetch';

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

  it.each([401, 403, 429, 503, 200])(
    'only broadcasts a session rejection for HTTP 401, received %s',
    async (status) => {
      const browser = new EventTarget();
      const rejected = vi.fn();
      browser.addEventListener(APP_SESSION_REJECTED, rejected);
      vi.stubGlobal('window', browser);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
      expect((await fetchAppApi('/api/dashboard/session')).status).toBe(status);
      expect(rejected).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    },
  );
});
