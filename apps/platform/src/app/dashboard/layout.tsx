import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { AgentAvailabilityControl } from '@/components/agent-availability-control';
import { DashboardProfileSummary } from '@/components/dashboard-profile-settings';
import { getProfile } from '@/server/composition/profile/profile-service';
import { DashboardDock } from '@/components/dashboard-dock';
import { DashboardSessionGuard } from '@/components/dashboard-session-guard';
import { DashboardNotificationCenter } from '@/components/dashboard-notification-center';
import { IncomingCallAlert } from '@/components/incoming-call-alert';
import { requireDashboardUser } from '@/server/interfaces/auth/access';
import { AutocallWordmark } from '@/components/autocall-wordmark';
import { HeavyWorkspaceBackground } from '@/components/heavy-workspace-background';
import { listNotificationsForUser } from '@/server/composition/notifications/notification-service';
import { listIncomingCallsForAgent } from '@/server/composition/calls/call-service';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireDashboardUser();
  const [initialNotifications, initialCalls, initialProfile] = await Promise.all([
    listNotificationsForUser(user.id, { limit: 50, unreadOnly: false }),
    listIncomingCallsForAgent(),
    getProfile(user),
  ]);
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
            <DashboardNotificationCenter
              initialNotifications={initialNotifications}
              userId={user.id}
            />
            <AgentAvailabilityControl />
            <DashboardProfileSummary profile={initialProfile} />
          </div>
        </header>
        <main className="workspace-content" id="workspace-content" tabIndex={-1}>
          {children}
        </main>
        <IncomingCallAlert initialCalls={initialCalls} />
        <Suspense>
          <DashboardDock initialProfile={initialProfile} returnTo={user.returnTo} />
        </Suspense>
      </div>
    </DashboardSessionGuard>
  );
}
