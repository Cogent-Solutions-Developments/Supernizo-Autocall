'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { withAppBasePath } from '@/lib/app-path';

export function SupernizoSignIn() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    window.history.replaceState(null, '', url.pathname);
    void signIn('supernizo', {
      code,
      state,
      redirect: false,
      callbackUrl: withAppBasePath('/dashboard'),
    })
      .then((result) => {
        if (result?.ok && !result.error) window.location.replace(withAppBasePath('/dashboard'));
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);
  if (!failed) {
    return (
      <p className="sr-only" role="status">
        Opening Autocall…
      </p>
    );
  }

  return (
    <main className="grid min-h-screen place-content-center gap-4 bg-[#071019] p-8 text-center text-white">
      <h1 className="text-xl font-semibold">Unable to open Autocall</h1>
      <p>
        Return to Supernizo and select Autocall to try again. Your administrator can check your
        access.
      </p>
      <a className="text-sky-300 underline" href={withAppBasePath('/sso/start')}>
        Return to Supernizo
      </a>
    </main>
  );
}
