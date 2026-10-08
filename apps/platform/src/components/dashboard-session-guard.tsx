'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { APP_SESSION_REJECTED, fetchAppApi } from '@/lib/app-fetch';
import { withAppBasePath } from '@/lib/app-path';
import { watchSessionValidation } from '@/lib/session-validation';

export function DashboardSessionGuard({
  children,
  returnTo,
}: Readonly<{ children: ReactNode; returnTo?: string | undefined }>) {
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    if (rejected) return;
    let active = true;
    const reject = () => {
      if (active) setRejected(true);
    };
    window.addEventListener(APP_SESSION_REJECTED, reject);
    const stop = watchSessionValidation(async () => {
      if (!active || rejected) return;
      // Outages do not destroy a session; a definitive rejection does.
      const response = await fetchAppApi('/api/dashboard/session', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 401) reject();
    });
    return () => {
      active = false;
      stop();
      window.removeEventListener(APP_SESSION_REJECTED, reject);
    };
  }, [rejected]);

  if (rejected) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#071019] p-6 text-white">
        <section role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Autocall session ended</h1>
          <p className="mt-3">Your session expired or your Autocall access was removed.</p>
          <a
            className="mt-6 inline-block text-sky-200 underline"
            href={returnTo ?? withAppBasePath('/login')}
          >
            {returnTo ? 'Return to Supernizo' : 'Sign in again'}
          </a>
        </section>
      </main>
    );
  }

  return children;
}
