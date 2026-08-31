import { NextResponse } from 'next/server';

import { IdSchema } from '@supernizo/shared';

import { requireSiteAccess } from '@/server/auth/access';
import { NotFoundError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { getCall } from '@/server/services/call-service';

type CallRouteContext = Readonly<{ params: Promise<{ callId: string }> }>;

export const runtime = 'nodejs';

export async function GET(request: Request, context: CallRouteContext): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const { callId } = await context.params;
    const parsedId = IdSchema.safeParse(callId);
    if (!parsedId.success) throw new ValidationError('The call identifier is invalid.');
    const call = await getCall(parsedId.data);
    if (!call) throw new NotFoundError('The requested call does not exist.');
    await requireSiteAccess(call.siteId);
    return withRequestId(NextResponse.json({ data: call, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
