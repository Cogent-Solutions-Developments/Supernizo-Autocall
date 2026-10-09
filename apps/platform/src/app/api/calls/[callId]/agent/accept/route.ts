import { NextResponse } from 'next/server';

import { IdSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/interfaces/auth/access';
import { assertRole } from '@/server/domain/auth/roles';
import { ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { claimIncomingCall, getCallScope } from '@/server/composition/calls/call-service';

type RouteContext = Readonly<{ params: Promise<{ callId: string }> }>;

export const runtime = 'nodejs';

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { callId } = await context.params;
    const parsed = IdSchema.safeParse(callId);
    if (!parsed.success) throw new ValidationError('The call identifier is invalid.');
    const user = await requireRole('ADMIN', 'AGENT');
    const scope = await getCallScope(parsed.data);
    if (!scope) throw new ValidationError('The requested call is not available.');
    const access = await requireSiteAccess(scope.siteId);
    assertRole(access.siteRole, ['ADMIN', 'AGENT']);
    const call = await claimIncomingCall(parsed.data, user.id);
    return withRequestId(NextResponse.json({ data: call, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
