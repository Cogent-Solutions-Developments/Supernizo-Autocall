'use client';

import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import {
  CallSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { LiveKitMediaRoom } from '@/app/components/livekit-media-room';

const CallWidgetConfigSchema = z.object({
  channel: z.string().min(1),
  token: z.string().min(1),
});
const { useRealtime } = createRealtime<{
  call: {
    incoming: z.ZodObject<{ call: typeof CallSchema }>;
    status: z.ZodObject<{ call: typeof CallSchema }>;
  };
}>();

type CallWidgetFrameProps = Readonly<{ hostOrigin: string }>;
type CallWidgetConfig = z.infer<typeof CallWidgetConfigSchema>;

function CallSubscription({
  config,
  onCall,
}: Readonly<{
  config: CallWidgetConfig | null;
  onCall: (call: Call) => void;
}>) {
  useRealtime({
    channels: config ? [config.channel] : [],
    enabled: Boolean(config),
    events: ['call.incoming', 'call.status'],
    onData: ({ data }) => onCall(data.call),
  });
  return null;
}

export function CallWidgetFrame({ hostOrigin }: CallWidgetFrameProps) {
  const [config, setConfig] = useState<CallWidgetConfig | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [media, setMedia] = useState<LiveKitTokenResponse | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== hostOrigin || !event.data || typeof event.data !== 'object') return;
      const data = event.data as {
        call?: unknown;
        config?: unknown;
        media?: unknown;
        type?: unknown;
      };
      if (data.type === 'supernizo-call-config') {
        const parsed = CallWidgetConfigSchema.safeParse(data.config);
        if (parsed.success) setConfig(parsed.data);
      }
      if (data.type === 'supernizo-call-status') {
        const parsed = CallSchema.safeParse(data.call);
        if (parsed.success) setCall(parsed.data);
      }
      if (data.type === 'supernizo-call-media') {
        const parsed = LiveKitTokenResponseSchema.safeParse(data.media);
        if (parsed.success) setMedia(parsed.data);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'supernizo-call-ready' }, hostOrigin);
    return () => window.removeEventListener('message', receive);
  }, [hostOrigin]);

  useEffect(() => {
    const visible =
      call !== null &&
      !['CANCELLED', 'ENDED', 'FAILED', 'MISSED', 'REJECTED'].includes(call.status);
    window.parent.postMessage({ type: 'supernizo-call-visibility', visible }, hostOrigin);
  }, [call, hostOrigin]);

  const isRinging = call?.status === 'RINGING';
  const title = call?.type === 'VIDEO' ? 'Incoming video call' : 'Incoming audio call';

  return (
    <RealtimeProvider
      key={config?.token ?? 'unauthenticated'}
      api={{
        url: config ? `/api/realtime/${encodeURIComponent(config.token)}` : '/api/realtime',
        withCredentials: false,
      }}
    >
      <CallSubscription config={config} onCall={setCall} />
      {call ? (
        <section aria-live="assertive" className="call-card">
          <p className="eyebrow">{call.agentDisplayName ?? 'Support team'}</p>
          <h1>{isRinging ? title : `Call ${call.status.toLowerCase()}`}</h1>
          {isRinging ? (
            <p className="copy">
              Choose an option before any microphone or camera permission is requested.
            </p>
          ) : (
            <p className="copy">
              {media
                ? 'Connecting to the secure media room.'
                : 'Preparing secure media connection.'}
            </p>
          )}
          {isRinging ? (
            <div className="actions">
              <button
                className="decline"
                onClick={() =>
                  window.parent.postMessage(
                    { action: 'reject', call, type: 'supernizo-call-action' },
                    hostOrigin,
                  )
                }
                type="button"
              >
                Decline
              </button>
              <button
                className="accept"
                onClick={() =>
                  window.parent.postMessage(
                    { action: 'accept', call, type: 'supernizo-call-action' },
                    hostOrigin,
                  )
                }
                type="button"
              >
                Accept
              </button>
            </div>
          ) : null}
          {call && media && ['ACCEPTED', 'CONNECTING', 'ACTIVE'].includes(call.status) ? (
            <LiveKitMediaRoom
              call={call}
              media={media}
              onEnd={() =>
                window.parent.postMessage({ call, type: 'supernizo-call-end' }, hostOrigin)
              }
            />
          ) : null}
        </section>
      ) : null}
      <style jsx>{`
        .call-card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
          color: #0f172a;
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        .eyebrow {
          color: #2563eb;
          font-size: 13px;
          font-weight: 700;
          margin: 0;
          text-transform: uppercase;
        }
        h1 {
          font-size: 20px;
          margin: 8px 0;
        }
        .copy {
          color: #475569;
          font-size: 14px;
          line-height: 1.4;
          margin: 0;
        }
        .actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 18px;
        }
        button {
          border: 0;
          border-radius: 9px;
          font-size: 14px;
          font-weight: 700;
          padding: 10px 14px;
        }
        .decline {
          background: #fee2e2;
          color: #b91c1c;
        }
        .accept {
          background: #0f172a;
          color: #fff;
        }
      `}</style>
    </RealtimeProvider>
  );
}
