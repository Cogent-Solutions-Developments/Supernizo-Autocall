import { NextResponse } from 'next/server';

import { ChatInboxQuerySchema, ChatThreadCreateRequestSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { listChatInboxThreads, resolveOrCreateChatThread } from '@/server/services/chat-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = ChatInboxQuerySchema.safeParse(query);
    if (!parsed.success) throw new ValidationError('The chat inbox query is invalid.');

    await requireRole('ADMIN', 'AGENT');
    const siteAccess = await requireSiteAccess(parsed.data.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const threads = await listChatInboxThreads(parsed.data.siteId, parsed.data.limit);
    return withRequestId(NextResponse.json({ data: { threads }, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The chat thread payload must be valid JSON.');
    }
    const parsed = ChatThreadCreateRequestSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('The chat thread payload is invalid.');

    const siteAccess = await requireSiteAccess(parsed.data.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const thread = await resolveOrCreateChatThread(
      parsed.data.siteId,
      parsed.data.visitorId,
      user.id,
    );
    return withRequestId(NextResponse.json({ data: thread, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
