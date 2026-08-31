import { NextResponse } from 'next/server';

import { CallVisitorActionRequestSchema, IdSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { handlePublicChatRequest } from '@/server/chat/public-route';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import {
  endVisitorCall,
  getCall,
  getCallScope,
  transitionCall,
} from '@/server/services/call-service';

type CallRouteContext = Readonly<{ params: Promise<{ callId: string }> }>;

export const runtime = 'nodejs';

export async function POST(request: Request, context: CallRouteContext): Promise<Response> {
  const requestId = getRequestId(request);
  const { callId } = await context.params;
  const parsedId = IdSchema.safeParse(callId);
  if (!parsedId.success) {
    return withRequestId(
      toHttpErrorResponse(new ValidationError('The call identifier is invalid.'), requestId),
      requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    body = {};
  }
  const visitorRequest = CallVisitorActionRequestSchema.safeParse(body);
  if (visitorRequest.success) {
    return handlePublicChatRequest(
      request,
      CallVisitorActionRequestSchema,
      'call-end',
      async ({ origin, payload }) =>
        NextResponse.json({ data: await endVisitorCall(parsedId.data, origin, payload.context) }),
    );
  }

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const call = await getCall(parsedId.data);
    if (!call) throw new NotFoundError('The requested call does not exist.');
    const siteAccess = await requireSiteAccess(call.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const scope = await getCallScope(call.id);
    if (!scope || (scope.agentId && scope.agentId !== user.id && user.role !== 'ADMIN')) {
      throw new ForbiddenError('The requested call is not available.');
    }
    return withRequestId(
      NextResponse.json({ data: await transitionCall(call.id, 'end'), requestId }),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
