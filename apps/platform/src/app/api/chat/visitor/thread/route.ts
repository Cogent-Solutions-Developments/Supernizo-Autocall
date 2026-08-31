import { NextResponse } from 'next/server';

import { PaginationSchema, TrackingContextSchema } from '@supernizo/shared';

import { handlePublicChatQuery } from '@/server/chat/public-route';
import { getVisitorChatThread } from '@/server/services/chat-service';

const VisitorThreadQuerySchema = TrackingContextSchema.merge(PaginationSchema);

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handlePublicChatQuery(
    request,
    VisitorThreadQuerySchema,
    'chat-thread-read',
    async ({ origin, query }) => {
      const thread = await getVisitorChatThread(origin, query, query);
      return NextResponse.json({ data: thread });
    },
  );
}
