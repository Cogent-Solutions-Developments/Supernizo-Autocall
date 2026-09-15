import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { IncomingCallWorkspace } from '@/app/components/incoming-call-workspace';
import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { getCall, getCallScope } from '@/server/services/call-service';

import { canOpenCallWorkspace } from './call-workspace-access';

export const dynamic = 'force-dynamic';

type CallPageProps = Readonly<{ params: Promise<{ callId: string }> }>;

export default async function IncomingCallPage({ params }: CallPageProps) {
  const { callId } = await params;
  if (!IdSchema.safeParse(callId).success) notFound();
  const user = await requireRole('ADMIN', 'AGENT');
  const [call, scope] = await Promise.all([getCall(callId), getCallScope(callId)]);
  if (!call || !scope) notFound();
  const access = await requireSiteAccess(scope.siteId);
  assertRole(access.siteRole, ['ADMIN', 'AGENT']);
  if (
    !canOpenCallWorkspace({
      assignedAgentId: scope.agentId,
      callStatus: call.status,
      userId: user.id,
    })
  ) {
    notFound();
  }

  return <IncomingCallWorkspace initialCall={call} />;
}
