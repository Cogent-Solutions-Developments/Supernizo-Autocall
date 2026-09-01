'use client';

import {
  PhoneIncomingIcon,
  PhoneXIcon,
  ShieldCheckIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { useState, useEffect } from 'react';
import { z } from 'zod';

import {
  CallSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { LiveKitMediaRoom } from '@/app/components/livekit-media-room';
import { withAppBasePath } from '@/lib/app-path';

import { callCopy, callHeading } from './call-display';
import { MediaPermissionError, requestMediaPermissions } from './media-permissions';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function CallWidgetFrame({ hostOrigin }: CallWidgetFrameProps) {
  const [config, setConfig] = useState<CallWidgetConfig | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [media, setMedia] = useState<LiveKitTokenResponse | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [connectedMediaCallId, setConnectedMediaCallId] = useState<string | null>(null);

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
  const hasActiveMedia =
    media !== null && call !== null && ['ACCEPTED', 'CONNECTING', 'ACTIVE'].includes(call.status);
  const agentName = call?.agentDisplayName ?? 'Event team';
  const showAvatar = Boolean(call?.agentAvatarUrl && call.agentAvatarUrl !== failedAvatarUrl);
  const mediaConnected = call?.id === connectedMediaCallId;

  async function acceptCall(): Promise<void> {
    if (!call || !navigator.mediaDevices?.getUserMedia) {
      setPermissionError('This browser cannot request microphone or camera access for the call.');
      return;
    }

    setIsRequestingPermission(true);
    setPermissionError(null);
    try {
      await requestMediaPermissions(call.type, (constraints) =>
        navigator.mediaDevices.getUserMedia(constraints),
      );
      window.parent.postMessage(
        { action: 'accept', call, type: 'supernizo-call-action' },
        hostOrigin,
      );
    } catch (error: unknown) {
      setPermissionError(
        error instanceof MediaPermissionError && error.permission === 'camera'
          ? 'Camera access is required to accept this video call. Allow camera access and try again.'
          : 'Microphone access is required to accept this call. Allow microphone access and try again.',
      );
    } finally {
      setIsRequestingPermission(false);
    }
  }

  function declineCall(): void {
    if (!call) return;
    window.parent.postMessage(
      { action: 'reject', call, type: 'supernizo-call-action' },
      hostOrigin,
    );
  }

  function endCall(): void {
    if (!call) return;
    window.parent.postMessage({ call, type: 'supernizo-call-end' }, hostOrigin);
  }

  return (
    <RealtimeProvider
      key={config?.token ?? 'unauthenticated'}
      api={{
        url: config
          ? withAppBasePath(`/api/realtime/${encodeURIComponent(config.token)}`)
          : withAppBasePath('/api/realtime'),
        withCredentials: false,
      }}
    >
      <CallSubscription config={config} onCall={setCall} />
      {call ? (
        <section
          aria-live="assertive"
          className={`call-card ${call.type === 'AUDIO' ? 'audio-call' : 'video-call'} ${hasActiveMedia ? 'has-media' : ''}`}
        >
          <div aria-hidden="true" className="ambient ambient-one" />
          <div aria-hidden="true" className="ambient ambient-two" />

          <header className="call-header">
            <span className="brand">SUPERNIZO</span>
            <span className="secure">
              <ShieldCheckIcon aria-hidden="true" size={15} weight="fill" />
              Secure call
            </span>
          </header>

          <div className="caller">
            <div className={`avatar-ring ${isRinging ? 'is-ringing' : ''}`}>
              <div className="avatar">
                {showAvatar && call.agentAvatarUrl ? (
                  // User-configured cross-origin avatar URLs cannot use Next Image host allowlists.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${agentName} profile`}
                    onError={() => setFailedAvatarUrl(call.agentAvatarUrl ?? null)}
                    src={call.agentAvatarUrl}
                  />
                ) : (
                  <span aria-label={`${agentName} initials`}>{initials(agentName) || 'S'}</span>
                )}
              </div>
              <span aria-hidden="true" className="online-dot" />
            </div>

            <p className="eyebrow">{agentName}</p>
            <h1>{callHeading(call, mediaConnected)}</h1>
            <p className="copy">{callCopy(call, Boolean(media), mediaConnected)}</p>
            <p className="call-kind">
              {call.type === 'VIDEO' ? (
                <VideoCameraIcon aria-hidden="true" size={15} weight="fill" />
              ) : (
                <PhoneIncomingIcon aria-hidden="true" size={15} weight="fill" />
              )}
              {call.type === 'VIDEO' ? 'Video call' : 'Audio call'}
            </p>
          </div>

          {permissionError ? <p className="error">{permissionError}</p> : null}

          {isRinging ? (
            <div className="incoming-actions">
              <button className="phone-action decline" onClick={declineCall} type="button">
                <span className="action-icon">
                  <PhoneXIcon aria-hidden="true" size={25} weight="fill" />
                </span>
                <span>Decline</span>
              </button>
              <button
                className="phone-action accept"
                disabled={isRequestingPermission}
                onClick={() => void acceptCall()}
                type="button"
              >
                <span className="action-icon">
                  <PhoneIncomingIcon aria-hidden="true" size={25} weight="fill" />
                </span>
                <span>{isRequestingPermission ? 'Allowing...' : 'Accept'}</span>
              </button>
            </div>
          ) : null}

          {hasActiveMedia && media ? (
            <LiveKitMediaRoom
              call={call}
              media={media}
              onConnected={() => setConnectedMediaCallId(call.id)}
              onEnd={endCall}
            />
          ) : null}

          <footer>
            <ShieldCheckIcon aria-hidden="true" size={14} weight="fill" />
            Encrypted connection
          </footer>
        </section>
      ) : null}

      <style jsx>{`
        :global(html),
        :global(body) {
          background: transparent;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }
        .call-card {
          background:
            radial-gradient(circle at 18% 15%, rgba(26, 151, 169, 0.32), transparent 27%),
            radial-gradient(circle at 88% 88%, rgba(13, 86, 119, 0.34), transparent 34%),
            linear-gradient(155deg, #0c3448 0%, #061c2d 54%, #031522 100%);
          border: 1px solid rgba(166, 228, 237, 0.34);
          border-radius: 27px;
          box-shadow:
            0 24px 60px rgba(1, 14, 25, 0.44),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
          color: #effbff;
          display: flex;
          flex-direction: column;
          font-family: Arial, sans-serif;
          height: calc(100vh - 2px);
          min-height: 500px;
          overflow: hidden;
          padding: 18px 22px 16px;
          position: relative;
          width: 100%;
        }
        .ambient {
          border: 1px solid rgba(104, 218, 223, 0.09);
          border-radius: 50%;
          pointer-events: none;
          position: absolute;
        }
        .ambient-one {
          height: 250px;
          right: -120px;
          top: -120px;
          width: 250px;
        }
        .ambient-two {
          bottom: -150px;
          height: 310px;
          left: -160px;
          width: 310px;
        }
        .call-header {
          align-items: center;
          display: flex;
          justify-content: space-between;
          position: relative;
          z-index: 1;
        }
        .brand {
          color: #72e3dd;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }
        .secure {
          align-items: center;
          background: rgba(164, 222, 231, 0.08);
          border: 1px solid rgba(174, 229, 237, 0.14);
          border-radius: 999px;
          color: #a9cbd3;
          display: inline-flex;
          font-size: 10px;
          gap: 5px;
          padding: 6px 9px;
        }
        .caller {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          min-height: 0;
          position: relative;
          text-align: center;
          z-index: 1;
        }
        .avatar-ring {
          border: 1px solid rgba(105, 231, 224, 0.28);
          border-radius: 50%;
          box-shadow:
            0 0 0 8px rgba(61, 206, 205, 0.08),
            0 18px 42px rgba(0, 8, 18, 0.3);
          height: 116px;
          margin: 8px 0 24px;
          padding: 6px;
          position: relative;
          width: 116px;
        }
        .avatar-ring::before,
        .avatar-ring::after {
          border: 1px solid rgba(92, 226, 218, 0.16);
          border-radius: inherit;
          content: '';
          inset: -13px;
          opacity: 0;
          position: absolute;
        }
        .avatar-ring.is-ringing::before {
          animation: ring-pulse 2s ease-out infinite;
        }
        .avatar-ring.is-ringing::after {
          animation: ring-pulse 2s 0.75s ease-out infinite;
        }
        .avatar {
          align-items: center;
          background: linear-gradient(145deg, #45d6cf, #126b8c);
          border-radius: 50%;
          display: flex;
          height: 100%;
          justify-content: center;
          overflow: hidden;
          width: 100%;
        }
        .avatar img {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
        .avatar span {
          color: #fff;
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.04em;
        }
        .online-dot {
          background: #35e1af;
          border: 4px solid #082438;
          border-radius: 50%;
          bottom: 5px;
          box-shadow: 0 0 0 3px rgba(53, 225, 175, 0.16);
          height: 12px;
          position: absolute;
          right: 5px;
          width: 12px;
        }
        .eyebrow {
          color: #72e3dd;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          margin: 0 0 8px;
          text-transform: uppercase;
        }
        h1 {
          font-size: 27px;
          letter-spacing: -0.035em;
          line-height: 1.12;
          margin: 0;
        }
        .copy {
          color: #adcad3;
          font-size: 13px;
          line-height: 1.5;
          margin: 10px auto 0;
          max-width: 265px;
        }
        .call-kind {
          align-items: center;
          color: #739ba8;
          display: inline-flex;
          font-size: 11px;
          gap: 6px;
          margin: 13px 0 0;
        }
        .error {
          background: rgba(190, 53, 69, 0.16);
          border: 1px solid rgba(255, 164, 170, 0.28);
          border-radius: 12px;
          color: #ffc6cb;
          font-size: 12px;
          line-height: 1.4;
          margin: 0 0 12px;
          padding: 9px 11px;
          position: relative;
          z-index: 1;
        }
        .incoming-actions {
          display: grid;
          gap: 42px;
          grid-template-columns: repeat(2, 74px);
          justify-content: center;
          padding: 8px 0 22px;
          position: relative;
          z-index: 1;
        }
        .phone-action {
          align-items: center;
          appearance: none;
          background: transparent;
          border: 0;
          color: #b5d0d8;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font-size: 11px;
          font-weight: 700;
          gap: 8px;
          padding: 0;
        }
        .action-icon {
          align-items: center;
          border-radius: 50%;
          display: flex;
          height: 58px;
          justify-content: center;
          transition:
            transform 0.18s ease,
            filter 0.18s ease;
          width: 58px;
        }
        .phone-action:hover .action-icon {
          filter: brightness(1.08);
          transform: translateY(-2px);
        }
        .decline .action-icon {
          background: linear-gradient(145deg, #ff5265, #d91e45);
          box-shadow: 0 10px 24px rgba(221, 33, 71, 0.24);
        }
        .accept .action-icon {
          background: linear-gradient(145deg, #45d6a4, #15956e);
          box-shadow: 0 10px 24px rgba(31, 184, 132, 0.24);
        }
        .phone-action:disabled {
          cursor: wait;
          opacity: 0.62;
        }
        footer {
          align-items: center;
          color: #5e8491;
          display: flex;
          font-size: 9px;
          gap: 5px;
          justify-content: center;
          letter-spacing: 0.06em;
          padding-top: 9px;
          position: relative;
          text-transform: uppercase;
          z-index: 1;
        }
        .video-call .avatar-ring {
          height: 82px;
          margin-bottom: 16px;
          width: 82px;
        }
        .video-call {
          overflow-y: auto;
        }
        .video-call .avatar span {
          font-size: 28px;
        }
        .video-call h1 {
          font-size: 23px;
        }
        .video-call.has-media {
          overflow: hidden;
          padding: 16px 18px 13px;
        }
        .video-call.has-media .caller {
          align-items: flex-start;
          flex: 0 0 auto;
          padding: 12px 2px 10px;
          text-align: left;
        }
        .video-call.has-media .avatar-ring,
        .video-call.has-media .copy,
        .video-call.has-media .call-kind {
          display: none;
        }
        .video-call.has-media .eyebrow {
          margin: 0 0 3px;
        }
        .video-call.has-media h1 {
          color: #dceef2;
          font-size: 17px;
          letter-spacing: -0.02em;
        }
        .video-call.has-media footer {
          padding-top: 4px;
        }
        @keyframes ring-pulse {
          0% {
            opacity: 0.8;
            transform: scale(0.92);
          }
          80%,
          100% {
            opacity: 0;
            transform: scale(1.22);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .avatar-ring.is-ringing::before,
          .avatar-ring.is-ringing::after {
            animation: none;
          }
          .action-icon {
            transition: none;
          }
        }
        @media (max-height: 520px) {
          .call-card {
            min-height: 0;
          }
          .avatar-ring {
            height: 82px;
            margin: 4px 0 15px;
            width: 82px;
          }
          .avatar span {
            font-size: 27px;
          }
          h1 {
            font-size: 23px;
          }
          .copy {
            margin-top: 7px;
          }
          .incoming-actions {
            padding-bottom: 12px;
          }
        }
      `}</style>
    </RealtimeProvider>
  );
}
