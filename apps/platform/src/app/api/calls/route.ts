import { after, NextResponse } from 'next/server';

import { CallCreateRequestSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { createCallWithAgentMedia } from '@/server/services/livekit-token-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const user = await requireRole('ADMIN', 'AGENT');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The call payload must be valid JSON.');
    }
    const parsed = CallCreateRequestSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('The call payload is invalid.');
    const siteAccess = await requireSiteAccess(parsed.data.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const started = await createCallWithAgentMedia(
      { ...parsed.data, agentId: user.id },
      { scheduleOperationalSync: after },
    );
    return withRequestId(
      NextResponse.json({ data: started.call, media: started.media, requestId }),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
