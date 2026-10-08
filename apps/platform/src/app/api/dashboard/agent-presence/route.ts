import { NextResponse } from 'next/server';

import { AgentPresenceHeartbeatSchema } from '@supernizo/shared';

import { requireRole } from '@/server/interfaces/auth/access';
import { ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { heartbeatAgent } from '@/server/composition/presence/agent-presence-service';
import { reconcileStaleCallsForAgent } from '@/server/composition/calls/call-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const parsed = AgentPresenceHeartbeatSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError('The agent availability payload is invalid.');
    await reconcileStaleCallsForAgent(user.id);
    const presence = await heartbeatAgent(user.id, parsed.data.availability);
    return withRequestId(NextResponse.json({ data: presence, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
