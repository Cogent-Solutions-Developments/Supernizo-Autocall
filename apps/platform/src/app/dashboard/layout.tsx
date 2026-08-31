import type { ReactNode } from 'react';

import { LogoutButton } from '@/app/components/logout-button';
import { requireDashboardUser } from '@/server/auth/access';

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await requireDashboardUser();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
          <div>
            <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
              Supernizo Autocall
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {user.name ?? user.email} · {user.role.toLowerCase()}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:px-10">{children}</div>
    </main>
  );
}
