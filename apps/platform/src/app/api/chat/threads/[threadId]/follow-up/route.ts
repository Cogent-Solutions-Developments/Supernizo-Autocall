import { NextResponse } from 'next/server';
import { ChatFollowUpUpdateSchema, IdSchema } from '@supernizo/shared';
import { requireRole, requireSiteAccess } from '@/server/interfaces/auth/access';
import { assertRole } from '@/server/domain/auth/roles';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { getChatThreadScope } from '@/server/composition/chat/chat-service';
import {
  getChatFollowUp,
  updateChatFollowUp,
} from '@/server/composition/chat/chat-contact-service';
type Context = Readonly<{ params: Promise<{ threadId: string }> }>;
export const runtime = 'nodejs';
async function authorize(context: Context): Promise<string> {
  await requireRole('ADMIN', 'AGENT');
  const parsed = IdSchema.safeParse((await context.params).threadId);
  if (!parsed.success) throw new ValidationError('The chat identifier is invalid.');
  const scope = await getChatThreadScope(parsed.data);
  if (!scope) throw new ForbiddenError('The chat is not available.');
  const access = await requireSiteAccess(scope.siteId);
  assertRole(access.siteRole, ['ADMIN', 'AGENT']);
  return parsed.data;
}
export async function GET(request: Request, context: Context): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const threadId = await authorize(context);
    return withRequestId(
      NextResponse.json(
        { data: await getChatFollowUp(threadId) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const threadId = await authorize(context);
    const body: unknown = await request.json().catch(() => {
      throw new ValidationError('The follow-up payload must be valid JSON.');
    });
    const parsed = ChatFollowUpUpdateSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('The follow-up status is invalid.');
    return withRequestId(
      NextResponse.json(
        { data: await updateChatFollowUp(threadId, parsed.data.status) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
