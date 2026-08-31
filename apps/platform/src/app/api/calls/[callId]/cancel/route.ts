import { NextResponse } from 'next/server';

import { IdSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { NotFoundError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { getCall, getCallScope, transitionCall } from '@/server/services/call-service';

type CallRouteContext = Readonly<{ params: Promise<{ callId: string }> }>;

export const runtime = 'nodejs';

export async function POST(request: Request, context: CallRouteContext): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const { callId } = await context.params;
    const parsedId = IdSchema.safeParse(callId);
    if (!parsedId.success) throw new ValidationError('The call identifier is invalid.');
    const call = await getCall(parsedId.data);
    if (!call) throw new NotFoundError('The requested call does not exist.');
    const siteAccess = await requireSiteAccess(call.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const scope = await getCallScope(call.id);
    if (!scope || (scope.agentId && scope.agentId !== user.id && user.role !== 'ADMIN')) {
      throw new NotFoundError('The requested call does not exist.');
    }
    const updated = await transitionCall(call.id, 'cancel');
    return withRequestId(NextResponse.json({ data: updated, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
