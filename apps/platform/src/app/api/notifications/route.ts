import { NextResponse } from 'next/server';

import { NotificationListQuerySchema } from '@supernizo/shared';

import { requireRole } from '@/server/interfaces/auth/access';
import { ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { listNotificationsForUser } from '@/server/composition/notifications/notification-service';

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
