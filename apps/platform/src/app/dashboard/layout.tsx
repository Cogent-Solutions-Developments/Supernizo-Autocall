import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AgentAvailabilityControl } from '@/app/components/agent-availability-control';
import { AuthClientProvider } from '@/app/components/auth-client-provider';
import { LogoutButton } from '@/app/components/logout-button';
import loginBackground from '@/assets/loging  background.webp';
import { requireDashboardUser } from '@/server/auth/access';

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await requireDashboardUser();

  return (
    <main className="dashboard-theme relative min-h-screen overflow-x-hidden bg-[#071019]">
      <Image
        alt=""
        className="object-cover opacity-15"
        fill
        priority
        sizes="100vw"
        src={loginBackground}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(35,119,153,0.36),transparent_34%),radial-gradient(circle_at_8%_100%,rgba(15,72,95,0.25),transparent_30%)]" />
      <header className="fixed right-4 top-4 z-30 max-w-[calc(100vw-2rem)] sm:right-6 sm:top-6">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200/20 bg-[#0b1a24]/90 p-1.5 shadow-xl shadow-black/35 backdrop-blur-xl">
          <Link
            aria-label="Supernizo dashboard"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-[#0b1a24]"
            href="/dashboard"
            prefetch={false}
          >
            S
          </Link>
          <nav
            aria-label="Dashboard"
            className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-slate-200"
          >
            <Link
              className="whitespace-nowrap rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              href="/dashboard"
              prefetch={false}
            >
              Events
            </Link>
            <Link
              className="whitespace-nowrap rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              href="/dashboard/live"
            >
              Live
            </Link>
            <Link
              className="whitespace-nowrap rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              href="/dashboard/calls"
            >
              Calls
            </Link>
            <Link
              className="whitespace-nowrap rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white"
              href="/dashboard/analytics"
            >
              Analytics
            </Link>
          </nav>
          <div className="hidden h-7 w-px shrink-0 bg-sky-100/20 xl:block" />
          <div className="hidden shrink-0 xl:block">
            {user.role === 'ADMIN' || user.role === 'AGENT' ? <AgentAvailabilityControl /> : null}
          </div>
          <div className="hidden shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0b1a24] 2xl:block">
            {user.name ?? user.email}
          </div>
          <div className="shrink-0">
            <AuthClientProvider>
              <LogoutButton />
            </AuthClientProvider>
          </div>
        </div>
      </header>
      <div className="dashboard-content relative mx-auto w-full max-w-7xl px-6 py-8 sm:px-10 sm:py-10">
        {children}
      </div>
    </main>
  );
}
