import { after, NextResponse } from 'next/server';

import { CallRequestRequestSchema } from '@supernizo/shared';

import { handlePublicChatRequest } from '@/server/chat/public-route';
import { requestVisitorCall } from '@/server/services/call-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handlePublicChatRequest(
    request,
    CallRequestRequestSchema,
    'call-request',
    async ({ origin, payload }) =>
      NextResponse.json({
        data: await requestVisitorCall(origin, payload.context, payload.type, {
          scheduleOperationalSync: after,
        }),
      }),
  );
}
