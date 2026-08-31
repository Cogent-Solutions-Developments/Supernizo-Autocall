import { NextResponse } from 'next/server';

import { LiveKitTokenRequestSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { handlePublicChatRequest } from '@/server/chat/public-route';
import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { getCallScope } from '@/server/services/call-service';
import {
  issueAgentLiveKitToken,
  issueVisitorLiveKitToken,
} from '@/server/services/livekit-token-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return withRequestId(
      toHttpErrorResponse(
        new ValidationError('The LiveKit token payload must be valid JSON.'),
        requestId,
      ),
      requestId,
    );
  }
  const parsed = LiveKitTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withRequestId(
      toHttpErrorResponse(new ValidationError('The LiveKit token payload is invalid.'), requestId),
      requestId,
    );
  }

  if (parsed.data.participantRole === 'VISITOR') {
    if (!parsed.data.context) {
      return withRequestId(
        toHttpErrorResponse(
          new ValidationError('Visitor token requests require tracking context.'),
          requestId,
        ),
        requestId,
      );
    }
    return handlePublicChatRequest(
      request,
      LiveKitTokenRequestSchema,
      'livekit-token',
      async ({ origin, payload }) => {
        if (payload.participantRole !== 'VISITOR' || !payload.context) {
          throw new ForbiddenError('The requested participant role is not permitted.');
        }
        return NextResponse.json({
          data: await issueVisitorLiveKitToken(payload.callId, origin, payload.context),
        });
      },
    );
  }

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const scope = await getCallScope(parsed.data.callId);
    if (!scope) throw new ForbiddenError('The requested call is not available.');
    const siteAccess = await requireSiteAccess(scope.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const token = await issueAgentLiveKitToken(parsed.data.callId, user.id);
    return withRequestId(NextResponse.json({ data: token, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
