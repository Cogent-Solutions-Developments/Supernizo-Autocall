import { NextResponse } from 'next/server';
import { ChatVisitorContactRequestSchema, TrackingContextSchema } from '@supernizo/shared';
import {
  handlePublicChatQuery,
  handlePublicChatRequest,
} from '@/server/interfaces/chat/public-route';
import {
  getVisitorContactPrompt,
  saveVisitorContact,
} from '@/server/composition/chat/chat-contact-service';
export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  return handlePublicChatQuery(
    request,
    TrackingContextSchema,
    'chat-contact-read',
    async ({ origin, query }) => {
      return NextResponse.json(
        { data: await getVisitorContactPrompt(origin, query) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    },
  );
}
export async function POST(request: Request): Promise<Response> {
  return handlePublicChatRequest(
    request,
    ChatVisitorContactRequestSchema,
    'chat-contact-write',
    async ({ origin, payload }) => {
      const result = await saveVisitorContact(
        origin,
        payload.context,
        payload.threadId,
        payload.contact,
      );
      return NextResponse.json({ data: result }, { headers: { 'Cache-Control': 'no-store' } });
    },
  );
}
