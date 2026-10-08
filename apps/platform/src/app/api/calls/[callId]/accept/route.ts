import { after, NextResponse } from 'next/server';

import { CallVisitorActionRequestSchema, IdSchema } from '@supernizo/shared';

import { handlePublicChatRequest } from '@/server/interfaces/chat/public-route';
import { ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { acceptVisitorCallWithMedia } from '@/server/composition/calls/livekit-token-service';

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
    'call-accept',
    async ({ origin, payload }) => {
      const accepted = await acceptVisitorCallWithMedia(parsedId.data, origin, payload.context, {
        scheduleOperationalSync: after,
      });
      return NextResponse.json({ data: accepted.call, media: accepted.media });
    },
  );
}
