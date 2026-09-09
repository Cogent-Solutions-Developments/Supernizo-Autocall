import { NextResponse } from 'next/server';
import { NotificationSyncPageRequestSchema } from '@supernizo/shared';

import { ServiceUnavailableError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import {
  notificationSyncEnabled,
  readNotificationSyncBody,
  verifyNotificationSyncSignature,
} from '@/server/integrations/supernizo-signature';
import { listNotificationSyncPage } from '@/server/services/notification-sync-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    if (!notificationSyncEnabled())
      throw new ServiceUnavailableError('Notification synchronization is disabled.');

    const body = await readNotificationSyncBody(request);
    verifyNotificationSyncSignature(request.headers, body);
    const parsed = NotificationSyncPageRequestSchema.safeParse(JSON.parse(body) as unknown);
    if (!parsed.success) throw new ValidationError('Invalid notification sync request.');

    const page = await listNotificationSyncPage(parsed.data);
    return withRequestId(
      NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } }),
      requestId,
    );
  } catch (error: unknown) {
    const mapped =
      error instanceof SyntaxError ? new ValidationError('Invalid JSON payload.') : error;
    return withRequestId(toHttpErrorResponse(mapped, requestId), requestId);
  }
}
