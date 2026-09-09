import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { AgentAvailabilityControl } from '@/app/components/agent-availability-control';
import { DashboardDock } from '@/app/components/dashboard-dock';
import { DashboardSessionGuard } from '@/app/components/dashboard-session-guard';
import { requireDashboardUser } from '@/server/auth/access';
import { AutocallWordmark } from '@/app/components/autocall-wordmark';
import { HeavyWorkspaceBackground } from '@/app/components/heavy-workspace-background';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireDashboardUser();
  return (
    <DashboardSessionGuard returnTo={user.returnTo}>
      <div className="workspace-theme workspace-canvas">
        <HeavyWorkspaceBackground />
        <a className="workspace-skip" href="#workspace-content">
          Skip to content
        </a>
        <header className="workspace-header">
          <Link aria-label="Supernizo Autocall dashboard" href="/dashboard" prefetch={false}>
            <AutocallWordmark />
          </Link>
          <div className="workspace-account">
            <AgentAvailabilityControl />
          </div>
        </header>
        <main className="workspace-content" id="workspace-content" tabIndex={-1}>
          {children}
        </main>
        <Suspense>
          <DashboardDock returnTo={user.returnTo} />
        </Suspense>
      </div>
    </DashboardSessionGuard>
  );
}
