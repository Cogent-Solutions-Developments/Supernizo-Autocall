'use client';

import {
  MicrophoneIcon,
  PhoneIncomingIcon,
  PhoneXIcon,
  ShieldCheckIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  CallSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type CallMediaFailureCode,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { LiveKitMediaRoom } from '@/app/components/livekit-media-room';
import companyLogo from '@/assets/Company Logo.png';
import callBackground from '@/assets/call bg.webp';
import { useLiveKitCallSession } from '@/client/calls/use-livekit-call-session';
import { withAppBasePath } from '@/lib/app-path';

import { callCopy, callHeading } from './call-display';
import { optimisticallyEndCall, shouldIgnoreCallUpdate } from './call-end-state';
import { MediaPermissionError } from './media-permissions';

const CallWidgetConfigSchema = z.object({
  channel: z.string().min(1),
  livekitUrl: z.url().optional(),
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
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isPermissionPromptOpen, setIsPermissionPromptOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [connectedMediaCallId, setConnectedMediaCallId] = useState<string | null>(null);
  const endingCallId = useRef<string | null>(null);
  const mediaFailureCallId = useRef<string | null>(null);
  const callIsTerminal =
    call !== null && ['CANCELLED', 'ENDED', 'FAILED', 'MISSED', 'REJECTED'].includes(call.status);
  const callMedia = useLiveKitCallSession(
    call && !callIsTerminal && (config?.livekitUrl || media?.url)
      ? {
          callId: call.id,
          url: config?.livekitUrl ?? media?.url ?? '',
        }
      : null,
  );
  const releaseLocalTracks = callMedia.releaseLocalTracks;

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== hostOrigin || !event.data || typeof event.data !== 'object') return;
      const data = event.data as {
        action?: unknown;
        call?: unknown;
        callId?: unknown;
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
        if (parsed.success && !shouldIgnoreCallUpdate(parsed.data.id, endingCallId.current)) {
          setCall(parsed.data);
          if (['CANCELLED', 'ENDED', 'FAILED', 'MISSED', 'REJECTED'].includes(parsed.data.status)) {
            setMedia(null);
          }
        }
      }
      if (data.type === 'supernizo-call-media') {
        const parsed = LiveKitTokenResponseSchema.safeParse(data.media);
        if (
          parsed.success &&
          typeof data.callId === 'string' &&
          data.callId === call?.id &&
          data.callId !== mediaFailureCallId.current
        ) {
          setMedia(parsed.data);
        }
      }
      if (
        data.type === 'supernizo-call-action-error' &&
        data.action === 'accept' &&
        typeof data.callId === 'string' &&
        data.callId === call?.id &&
        data.callId !== mediaFailureCallId.current
      ) {
        releaseLocalTracks();
        setPermissionError('The call could not be accepted. Please try again.');
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'supernizo-call-ready' }, hostOrigin);
    return () => window.removeEventListener('message', receive);
  }, [call?.id, hostOrigin, releaseLocalTracks]);

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

  function acceptCall(): void {
    if (!call) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError('This browser cannot request microphone or camera access for the call.');
      window.parent.postMessage(
        {
          call,
          failureCode: 'MEDIA_DEVICE_UNAVAILABLE' satisfies CallMediaFailureCode,
          type: 'supernizo-call-media-failure',
        },
        hostOrigin,
      );
      return;
    }
    if (!callMedia.room) {
      setPermissionError('The secure media room is still preparing. Please try again.');
      return;
    }

    mediaFailureCallId.current = null;
    setPermissionError(null);
    const capture = callMedia.captureLocalTracks(call.type);
    window.parent.postMessage(
      { action: 'accept', call, type: 'supernizo-call-action' },
      hostOrigin,
    );
    void capture.catch((error: unknown) => {
      mediaFailureCallId.current = call.id;
      const failureCode: CallMediaFailureCode =
        error instanceof MediaPermissionError
          ? error.permission === 'camera'
            ? 'MEDIA_CAMERA_PERMISSION_DENIED'
            : 'MEDIA_MICROPHONE_PERMISSION_DENIED'
          : 'MEDIA_DEVICE_UNAVAILABLE';
      setPermissionError(
        error instanceof MediaPermissionError && error.permission === 'camera'
          ? 'Camera access is required to accept this video call. Allow camera access and try again.'
          : 'Microphone access is required to accept this call. Allow microphone access and try again.',
      );
      window.parent.postMessage(
        { call, failureCode, type: 'supernizo-call-media-failure' },
        hostOrigin,
      );
    });
  }

  function declineCall(): void {
    if (!call) return;
    setIsPermissionPromptOpen(false);
    window.parent.postMessage(
      { action: 'reject', call, type: 'supernizo-call-action' },
      hostOrigin,
    );
  }

  function endCall(): void {
    if (!call) return;
    endingCallId.current = call.id;
    setConnectedMediaCallId(null);
    setIsPermissionPromptOpen(false);
    setMedia(null);
    callMedia.releaseLocalTracks();
    setCall(optimisticallyEndCall(call));
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
      <CallSubscription
        config={config}
        onCall={(nextCall) => {
          if (shouldIgnoreCallUpdate(nextCall.id, endingCallId.current)) return;
          if (nextCall.status === 'RINGING' && nextCall.id !== call?.id) {
            mediaFailureCallId.current = null;
            setConnectedMediaCallId(null);
            setMedia(null);
            setPermissionError(null);
            setIsPermissionPromptOpen(false);
          }
          setCall(nextCall);
        }}
      />
      {call ? (
        <section
          aria-label="Official event call"
          aria-live="assertive"
          className="relative flex h-[calc(100vh-2px)] min-h-[500px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 px-6 py-5 font-sans text-slate-900 shadow-[0_14px_34px_rgba(15,23,42,0.1)]"
        >
          <Image
            alt=""
            aria-hidden="true"
            className="pointer-events-none object-cover"
            fill
            priority
            sizes="330px"
            src={callBackground}
          />
          <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 p-0.5 ring-2 ring-slate-100">
                  {showAvatar && call.agentAvatarUrl ? (
                    // User-configured cross-origin avatar URLs cannot use Next Image host allowlists.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`${agentName} profile`}
                      className="block h-full w-full rounded-full object-cover"
                      onError={() => setFailedAvatarUrl(call.agentAvatarUrl ?? null)}
                      src={call.agentAvatarUrl}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-[#e8eef5] text-base font-bold tracking-[-0.04em] text-[#18324d]">
                      {initials(agentName) || 'S'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[15px] font-semibold text-slate-800">
                    {agentName}
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">
                <ShieldCheckIcon aria-hidden="true" size={13} weight="fill" />
                Verified
              </span>
            </header>

            <div aria-hidden="true" className="my-4 h-px bg-slate-100" />

            <div
              className={
                hasActiveMedia
                  ? 'flex min-h-0 flex-1 flex-col items-center overflow-y-auto pt-1 text-center'
                  : 'flex min-h-0 flex-1 flex-col items-center justify-center text-center'
              }
            >
              {isRinging && isPermissionPromptOpen ? (
                <>
                  <Image
                    alt="Cogent Solutions Dubai"
                    className="h-auto w-32 max-w-full"
                    priority
                    sizes="128px"
                    src={companyLogo}
                  />
                  <p className="m-0 mt-3 text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase">
                    Permission required
                  </p>
                  <span className="mt-4 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[#18324d]">
                    {call.type === 'VIDEO' ? (
                      <VideoCameraIcon aria-hidden="true" size={22} weight="fill" />
                    ) : (
                      <MicrophoneIcon aria-hidden="true" size={22} weight="fill" />
                    )}
                  </span>
                  <h1 className="!m-0 mt-3 !text-lg !font-semibold !leading-tight text-slate-900">
                    {call.type === 'VIDEO'
                      ? 'Allow camera and microphone'
                      : 'Allow microphone access'}
                  </h1>
                  <p className="m-0 mt-2 max-w-[265px] text-sm leading-5 text-slate-600">
                    {call.type === 'VIDEO'
                      ? 'To join this official event call, allow camera and microphone access in your browser.'
                      : 'To join this official event call, allow microphone access in your browser.'}
                  </p>
                </>
              ) : (
                <>
                  <Image
                    alt="Cogent Solutions Dubai"
                    className={`h-auto max-w-full ${hasActiveMedia ? 'w-32' : 'w-44'}`}
                    priority
                    sizes={hasActiveMedia ? '128px' : '176px'}
                    src={companyLogo}
                  />
                  <p
                    className={`m-0 text-[10px] font-bold tracking-[0.16em] text-slate-500 uppercase ${
                      hasActiveMedia ? 'mt-3' : 'mt-5'
                    }`}
                  >
                    Official event call
                  </p>
                  {!isRinging ? (
                    <h1 className="!m-0 mt-2 !text-lg !font-semibold !leading-tight text-slate-900">
                      {callHeading(call, mediaConnected)}
                    </h1>
                  ) : null}
                  <p className="m-0 mt-2 max-w-[265px] text-sm leading-5 text-slate-600">
                    {isRinging
                      ? 'Cogent Solutions Dubai is calling to share event details with you.'
                      : callCopy(call, Boolean(media), mediaConnected)}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-600">
                    {call.type === 'VIDEO' ? (
                      <VideoCameraIcon aria-hidden="true" size={15} weight="fill" />
                    ) : (
                      <PhoneIncomingIcon aria-hidden="true" size={15} weight="fill" />
                    )}
                    {call.type === 'VIDEO' ? 'Video call' : 'Audio call'}
                  </span>
                </>
              )}
              {!isRinging && hasActiveMedia && media && callMedia.room ? (
                <div className="mt-3 w-full">
                  <LiveKitMediaRoom
                    call={call}
                    localTracks={callMedia.localTracks}
                    media={media}
                    onConnected={() => setConnectedMediaCallId(call.id)}
                    onEnd={endCall}
                    room={callMedia.room}
                  />
                </div>
              ) : null}
            </div>

            {permissionError ? (
              <p className="m-0 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs leading-5 text-rose-800">
                {permissionError}
              </p>
            ) : null}

            {isRinging ? (
              isPermissionPromptOpen ? (
                <button
                  className="inline-flex min-h-11 self-center items-center justify-center gap-2 rounded-full bg-[#18324d] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0f2740] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18324d] disabled:cursor-wait disabled:opacity-60"
                  disabled={callMedia.isCapturing || !callMedia.room}
                  onClick={acceptCall}
                  type="button"
                >
                  {call.type === 'VIDEO' ? (
                    <VideoCameraIcon aria-hidden="true" size={18} weight="fill" />
                  ) : (
                    <MicrophoneIcon aria-hidden="true" size={18} weight="fill" />
                  )}
                  {callMedia.isCapturing ? 'Requesting access…' : 'Allow access'}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    onClick={declineCall}
                    type="button"
                  >
                    <PhoneXIcon aria-hidden="true" size={18} weight="fill" />
                    Decline
                  </button>
                  <button
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#18324d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0f2740] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18324d] disabled:cursor-wait disabled:opacity-60"
                    disabled={callMedia.isCapturing || !callMedia.room}
                    onClick={() => {
                      setPermissionError(null);
                      setIsPermissionPromptOpen(true);
                    }}
                    type="button"
                  >
                    <PhoneIncomingIcon aria-hidden="true" size={18} weight="fill" />
                    Accept call
                  </button>
                </div>
              )
            ) : null}

            <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-[10px] font-medium tracking-[0.08em] text-slate-400 uppercase">
              <ShieldCheckIcon aria-hidden="true" size={13} weight="fill" />
              Encrypted connection
            </div>
          </div>
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
        .call-card.incoming-call {
          background: #fff;
          border-color: #d8e0e9;
          border-radius: 14px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
          color: #0f172a;
          padding: 20px 22px 18px;
        }
        .incoming-call .ambient {
          display: none;
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
        .incoming-call .call-header {
          flex-direction: column;
          gap: 8px;
          justify-content: center;
          text-align: center;
        }
        .brand-lockup {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .incoming-call .brand-lockup {
          align-items: center;
        .brand {
          color: #72e3dd;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }
        .incoming-call .brand {
          color: #0f172a;
          font-size: 11px;
          letter-spacing: 0.14em;
        }
        .official-label {
          color: #64748b;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .company-logo {
          display: block;
          height: auto;
          width: 148px;
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
        .incoming-call .secure {
          background: #f8fafc;
          border-color: #d8e0e9;
          color: #475569;
          font-size: 9px;
          padding: 6px 8px;
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
        .incoming-call .avatar-ring {
          border-color: #cbd5e1;
          box-shadow: 0 0 0 7px #f8fafc;
          height: 96px;
          margin-bottom: 21px;
          padding: 5px;
          width: 96px;
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
        .incoming-call .avatar-ring::before,
        .incoming-call .avatar-ring::after {
          border-color: #cbd5e1;
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
        .incoming-call .avatar {
          background: #e8eef5;
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
        .incoming-call .avatar span {
          color: #18324d;
          font-size: 31px;
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
        .incoming-call .online-dot {
          display: none;
        }
        .eyebrow {
          color: #72e3dd;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          margin: 0 0 8px;
          text-transform: uppercase;
        }
        .incoming-call .eyebrow {
          color: #475569;
          letter-spacing: 0.1em;
        }
        h1 {
          font-size: 27px;
          letter-spacing: -0.035em;
          line-height: 1.12;
          margin: 0;
        }
        .incoming-call h1 {
          color: #0f172a;
          font-size: 24px;
        }
        .copy {
          color: #adcad3;
          font-size: 13px;
          line-height: 1.5;
          margin: 10px auto 0;
          max-width: 265px;
        }
        .incoming-call .copy {
          color: #526477;
          max-width: 245px;
        }
        .call-kind {
          align-items: center;
          color: #739ba8;
          display: inline-flex;
          font-size: 11px;
          gap: 6px;
          margin: 13px 0 0;
        }
        .incoming-call .call-kind {
          background: #f8fafc;
          border: 1px solid #d8e0e9;
          border-radius: 999px;
          color: #475569;
          font-size: 10px;
          padding: 6px 9px;
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
        .incoming-call .error {
          background: #fff1f2;
          border-color: #fecdd3;
          color: #be123c;
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
        .incoming-call .incoming-actions {
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          padding: 12px 0 16px;
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
        .incoming-call .phone-action {
          align-items: center;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          color: #334155;
          flex-direction: row;
          font-size: 12px;
          gap: 9px;
          justify-content: center;
          min-height: 50px;
          padding: 0 12px;
          width: 100%;
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
        .incoming-call .decline .action-icon {
          background: transparent;
          box-shadow: none;
          color: #64748b;
          height: auto;
          width: auto;
        }
        .accept .action-icon {
          background: linear-gradient(145deg, #45d6a4, #15956e);
          box-shadow: 0 10px 24px rgba(31, 184, 132, 0.24);
        }
        .incoming-call .accept .action-icon {
          background: transparent;
          box-shadow: none;
          color: #fff;
          height: auto;
          width: auto;
        }
        .incoming-call .phone-action:hover {
          background: #f8fafc;
        }
        .incoming-call .phone-action:hover .action-icon {
          filter: none;
          transform: none;
        }
        .incoming-call .accept {
          background: #18324d;
          border-color: #18324d;
          color: #fff;
        }
        .incoming-call .accept:hover {
          background: #0f2740;
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
        .incoming-call footer {
          color: #94a3b8;
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
          .company-logo {
            width: 108px;
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
