import { NextResponse } from 'next/server';

import { CallVisitorActionRequestSchema, IdSchema } from '@supernizo/shared';

import { handlePublicChatRequest } from '@/server/chat/public-route';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { rejectVisitorCall } from '@/server/services/call-service';

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
  return handlePublicChatRequest(
    request,
    CallVisitorActionRequestSchema,
    'call-reject',
    async ({ origin, payload }) =>
      NextResponse.json({ data: await rejectVisitorCall(parsedId.data, origin, payload.context) }),
  );
}
