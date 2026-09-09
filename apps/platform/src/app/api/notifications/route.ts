import { NextResponse } from 'next/server';

import { NotificationListQuerySchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { listNotificationsForUser } from '@/server/services/notification-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = NotificationListQuerySchema.safeParse(query);
    if (!parsed.success) throw new ValidationError('The notification query is invalid.');

    const notifications = await listNotificationsForUser(user.id, parsed.data);
    return withRequestId(NextResponse.json({ data: { notifications }, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
