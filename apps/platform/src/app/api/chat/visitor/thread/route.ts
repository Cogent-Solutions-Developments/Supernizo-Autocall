import { NextResponse } from 'next/server';

import {
  ChatVisitorMessageRequestSchema,
  PaginationSchema,
  TrackingContextSchema,
} from '@supernizo/shared';

import { handlePublicChatQuery, handlePublicChatRequest } from '@/server/chat/public-route';
import { getVisitorChatThread, startVisitorChat } from '@/server/services/chat-service';

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

export async function POST(request: Request): Promise<Response> {
  return handlePublicChatRequest(
    request,
    ChatVisitorMessageRequestSchema,
    'chat-thread-start',
    async ({ origin, payload }) => {
      const thread = await startVisitorChat(origin, payload.context, payload.content);
      return NextResponse.json({ data: thread });
    },
  );
}
