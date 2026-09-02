import { WebhookReceiver } from 'livekit-server-sdk';
import { after } from 'next/server';
import { z } from 'zod';

import { getRequestId, withRequestId } from '@/server/http/request-id';
import { getLiveKitServerConfig } from '@/server/livekit/config';
import { logger } from '@/server/logging/logger';
import {
  handleLiveKitWebhookEvent,
  liveKitCallEventNames,
} from '@/server/services/livekit-token-service';

export const runtime = 'nodejs';

const LiveKitCallEventNameSchema = z.enum(liveKitCallEventNames);
const LiveKitWebhookInputSchema = z.object({
  event: LiveKitCallEventNameSchema,
  participantIdentity: z.string().min(1).max(255).optional(),
  roomName: z.string().min(1).max(191),
  trackMuted: z.boolean().optional(),
  trackName: z.string().max(255).optional(),
  trackSid: z.string().max(255).optional(),
  trackSource: z.string().max(64).optional(),
  trackType: z.string().max(64).optional(),
  webhookEventId: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  let webhookEvent: Awaited<ReturnType<WebhookReceiver['receive']>>;
  let config: ReturnType<typeof getLiveKitServerConfig>;

  try {
    config = getLiveKitServerConfig();
  } catch (error: unknown) {
    logger.log('error', 'livekit_webhook_configuration_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      requestId,
    });
    return withRequestId(
      new Response('LiveKit webhook is unavailable.', { status: 500 }),
      requestId,
    );
  }

  try {
    const body = await request.text();
    webhookEvent = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(
      body,
      request.headers.get('authorization') ?? undefined,
    );
  } catch (error: unknown) {
    logger.log('warn', 'livekit_webhook_rejected', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      requestId,
    });
    return withRequestId(new Response('Invalid LiveKit webhook.', { status: 401 }), requestId);
  }

  const parsedEventName = LiveKitCallEventNameSchema.safeParse(webhookEvent.event);
  if (!parsedEventName.success) {
    return withRequestId(new Response(null, { status: 204 }), requestId);
  }
  const parsedInput = LiveKitWebhookInputSchema.safeParse({
    event: parsedEventName.data,
    roomName: webhookEvent.room?.name,
    ...(webhookEvent.id ? { webhookEventId: webhookEvent.id } : {}),
    ...(webhookEvent.participant?.identity
      ? { participantIdentity: webhookEvent.participant.identity }
      : {}),
    ...(webhookEvent.track
      ? {
          trackMuted: webhookEvent.track.muted,
          trackName: webhookEvent.track.name,
          trackSid: webhookEvent.track.sid,
          trackSource: String(webhookEvent.track.source),
          trackType: String(webhookEvent.track.type),
        }
      : {}),
  });
  if (!parsedInput.success) {
    logger.log('warn', 'livekit_webhook_payload_invalid', {
      livekitEvent: parsedEventName.data,
      requestId,
    });
    return withRequestId(new Response(null, { status: 204 }), requestId);
  }

  try {
    await handleLiveKitWebhookEvent(parsedInput.data, { scheduleOperationalSync: after });
    logger.log('info', 'livekit_webhook_processed', {
      livekitEvent: parsedEventName.data,
      requestId,
      roomName: parsedInput.data.roomName,
    });
    return withRequestId(new Response(null, { status: 204 }), requestId);
  } catch (error: unknown) {
    logger.log('error', 'livekit_webhook_processing_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      livekitEvent: parsedEventName.data,
      requestId,
      roomName: parsedInput.data.roomName,
    });
    return withRequestId(
      new Response('LiveKit webhook processing failed.', { status: 500 }),
      requestId,
    );
  }
}
