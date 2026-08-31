import { WebhookReceiver } from 'livekit-server-sdk';

import { getLiveKitServerConfig } from '@/server/livekit/config';
import { handleLiveKitWebhookEvent } from '@/server/services/livekit-token-service';

export const runtime = 'nodejs';

const handledEvents = new Set(['participant_joined', 'participant_left', 'room_finished']);

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getLiveKitServerConfig();
    const body = await request.text();
    const event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(
      body,
      request.headers.get('authorization') ?? undefined,
    );
    const roomName = event.room?.name;
    if (!roomName || !handledEvents.has(event.event)) return new Response(null, { status: 204 });
    await handleLiveKitWebhookEvent({
      event: event.event as 'participant_joined' | 'participant_left' | 'room_finished',
      roomName,
      ...(event.participant?.identity ? { participantIdentity: event.participant.identity } : {}),
    });
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Invalid LiveKit webhook.', { status: 401 });
  }
}
