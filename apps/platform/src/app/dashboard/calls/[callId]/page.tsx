import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { IncomingCallWorkspace } from '@/app/components/incoming-call-workspace';
import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { getCall, getCallScope } from '@/server/services/call-service';

export const dynamic = 'force-dynamic';

type CallPageProps = Readonly<{ params: Promise<{ callId: string }> }>;

export default async function IncomingCallPage({ params }: CallPageProps) {
  const { callId } = await params;
  if (!IdSchema.safeParse(callId).success) notFound();
  const user = await requireRole('ADMIN', 'AGENT');
  const [call, scope] = await Promise.all([getCall(callId), getCallScope(callId)]);
  if (!call || !scope || scope.agentId !== user.id) notFound();
  const access = await requireSiteAccess(scope.siteId);
  assertRole(access.siteRole, ['ADMIN', 'AGENT']);

  return <IncomingCallWorkspace initialCall={call} />;
}
