import { NextResponse } from 'next/server';

import { IdSchema, NotificationReadRequestSchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { markNotificationRead } from '@/server/services/notification-service';

type NotificationRouteContext = Readonly<{ params: Promise<{ notificationId: string }> }>;

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: NotificationRouteContext,
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const user = await requireRole('ADMIN', 'AGENT');
    const { notificationId } = await context.params;
    const parsedId = IdSchema.safeParse(notificationId);
    if (!parsedId.success) throw new ValidationError('The notification identifier is invalid.');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The notification payload must be valid JSON.');
    }
    const parsedBody = NotificationReadRequestSchema.safeParse(body);
    if (!parsedBody.success) throw new ValidationError('The notification payload is invalid.');

    const notification = await markNotificationRead(user.id, parsedId.data);
    return withRequestId(NextResponse.json({ data: notification, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
