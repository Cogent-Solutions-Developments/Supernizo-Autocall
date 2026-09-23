import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { IncomingCallWorkspace } from '@/app/components/incoming-call-workspace';
import { requireDashboardUser, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { getCall, getCallScope } from '@/server/services/call-service';

import { getCallWorkspaceAccess } from './call-workspace-access';

export const dynamic = 'force-dynamic';

type CallPageProps = Readonly<{ params: Promise<{ callId: string }> }>;

export default async function IncomingCallPage({ params }: CallPageProps) {
  const user = await requireDashboardUser();
  assertRole(user.role, ['ADMIN', 'AGENT']);
  const { callId } = await params;
  if (!IdSchema.safeParse(callId).success) notFound();
  const [call, scope] = await Promise.all([getCall(callId), getCallScope(callId)]);
  if (!call || !scope) notFound();
  const access = await requireSiteAccess(scope.siteId);
  assertRole(access.siteRole, ['ADMIN', 'AGENT']);
  const workspaceAccess = getCallWorkspaceAccess({
    assignedAgentId: scope.agentId,
    callStatus: call.status,
    userId: user.id,
  });

  if (workspaceAccess === 'CLAIMED_BY_ANOTHER_AGENT') {
    return (
      <section
        className="workspace-panel mx-auto max-w-xl p-6 sm:p-8"
        style={{ backgroundColor: 'rgb(11 17 24)' }}
      >
        <p className="text-sm font-semibold tracking-[0.14em] text-emerald-300 uppercase">
          Call unavailable
        </p>
        <h1 className="mt-2 text-3xl font-light tracking-tight text-strong">
          Call was accepted by another agent.
        </h1>
        <p className="mt-3 text-muted">
          The visitor is already connected with another agent, so you cannot join this call.
        </p>
      </section>
    );
  }

  return <IncomingCallWorkspace initialCall={call} />;
}
