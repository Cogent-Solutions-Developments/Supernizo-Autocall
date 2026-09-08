'use client';

import { signOut } from 'next-auth/react';

import { withAppBasePath } from '@/lib/app-path';

export function LogoutButton() {
  return (
    <button
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
      onClick={() => signOut({ callbackUrl: withAppBasePath('/login') })}
      type="button"
    >
      Sign out
    </button>
  );
}
