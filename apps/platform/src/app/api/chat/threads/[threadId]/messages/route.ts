import { NextResponse } from 'next/server';

import {
  ChatAgentMessageRequestSchema,
  ChatHistoryQuerySchema,
  ChatVisitorMessageRequestSchema,
  IdSchema,
} from '@supernizo/shared';

import { requireRole, requireSiteAccess, requireUser } from '@/server/auth/access';
import { assertRole } from '@/server/auth/roles';
import { handlePublicChatRequest } from '@/server/chat/public-route';
import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import {
  getChatHistory,
  getChatThreadScope,
  sendAgentChatMessage,
  sendVisitorChatMessage,
} from '@/server/services/chat-service';

type ChatMessageRouteContext = Readonly<{ params: Promise<{ threadId: string }> }>;

export const runtime = 'nodejs';

async function getValidatedThreadId(context: ChatMessageRouteContext): Promise<string> {
  const { threadId } = await context.params;
  const parsed = IdSchema.safeParse(threadId);
  if (!parsed.success) throw new ValidationError('The chat thread identifier is invalid.');
  return parsed.data;
}

export async function GET(request: Request, context: ChatMessageRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const threadId = await getValidatedThreadId(context);
    const user = await requireUser();
    const scope = await getChatThreadScope(threadId);
    if (!scope) throw new ForbiddenError('The requested chat thread is not available.');
    await requireSiteAccess(scope.siteId);

    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsedQuery = ChatHistoryQuerySchema.safeParse(query);
    if (!parsedQuery.success) throw new ValidationError('The chat history query is invalid.');
    const history = await getChatHistory(threadId, parsedQuery.data);
    if (!history) throw new ValidationError('The chat history query is invalid.');

    return withRequestId(
      NextResponse.json({ data: { ...history, userId: user.id }, requestId }),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}

export async function POST(request: Request, context: ChatMessageRouteContext): Promise<Response> {
  const requestId = getRequestId(request);
  const threadId = await getValidatedThreadId(context).catch(() => undefined);
  if (!threadId) {
    return withRequestId(
      toHttpErrorResponse(new ValidationError('The chat thread identifier is invalid.'), requestId),
      requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return withRequestId(
      toHttpErrorResponse(new ValidationError('The chat message must be valid JSON.'), requestId),
      requestId,
    );
  }

  const visitorPayload = ChatVisitorMessageRequestSchema.safeParse(body);
  if (visitorPayload.success) {
    return handlePublicChatRequest(
      request,
      ChatVisitorMessageRequestSchema,
      'chat-message',
      async ({ origin, payload }) => {
        const message = await sendVisitorChatMessage(
          threadId,
          origin,
          payload.context,
          payload.content,
        );
        return NextResponse.json({ data: message });
      },
    );
  }

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const parsed = ChatAgentMessageRequestSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('The chat message payload is invalid.');
    const scope = await getChatThreadScope(threadId);
    if (!scope) throw new ForbiddenError('The requested chat thread is not available.');
    const siteAccess = await requireSiteAccess(scope.siteId);
    assertRole(siteAccess.siteRole, ['ADMIN', 'AGENT']);
    const message = await sendAgentChatMessage(threadId, user.id, parsed.data.content);
    return withRequestId(NextResponse.json({ data: message, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
