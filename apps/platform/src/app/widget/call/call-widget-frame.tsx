'use client';

import { MicrophoneIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  CallSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type CallMediaFailureCode,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { CallerIdentityVideo } from '@/app/components/caller-identity-video';
import { FlowingRibbons } from '@/app/components/flowing-ribbons';
import { LiveKitMediaRoom } from '@/app/components/livekit-media-room';
import { useLiveKitCallSession } from '@/client/calls/use-livekit-call-session';

import {
  AnswerCallIcon,
  DeclineCallIcon,
  EncryptedCallIcon,
  NizoVerifiedIcon,
} from './call-action-icons';
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

export function CallWidgetFrame({ hostOrigin }: CallWidgetFrameProps) {
  const [config, setConfig] = useState<CallWidgetConfig | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [media, setMedia] = useState<LiveKitTokenResponse | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isPermissionPromptOpen, setIsPermissionPromptOpen] = useState(false);
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
  const normalizedAgentName = agentName.trim().toLowerCase();
  const callerName =
    normalizedAgentName === 'local admin' || normalizedAgentName === 'nizo'
      ? 'Soniya Sahanya'
      : agentName;
  const mediaConnected = call?.id === connectedMediaCallId;
  const showPermissionPrompt = Boolean(isRinging && isPermissionPromptOpen);

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
        url: config ? `/api/realtime/${encodeURIComponent(config.token)}` : '/api/realtime',
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
          className="relative isolate flex h-[calc(100vh-2px)] min-h-0 w-full flex-col overflow-hidden rounded-[18px] border border-[#e4e4e7] bg-white text-[#18181b]"
        >
          {isRinging ? (
            <div
              className={`call-card__portrait-media absolute inset-0 z-0 ${
                showPermissionPrompt ? 'call-card__portrait-media--permission' : ''
              }`}
            >
              <CallerIdentityVideo variant="cover" />
            </div>
          ) : null}
          {isRinging ? (
            <div
              aria-hidden="true"
              className="call-card__portrait-blend pointer-events-none absolute inset-0 z-[1]"
            />
          ) : null}
          {showPermissionPrompt ? (
            <div
              aria-hidden="true"
              className="call-card__permission-veil pointer-events-none absolute inset-0 z-[2]"
            />
          ) : null}
          <div className="absolute inset-0 z-[3]">
            <FlowingRibbons
              animationSpeed={0.36}
              backgroundColor={isRinging ? 'transparent' : '#ffffff'}
              lineColor={isRinging ? 'rgba(39, 39, 42, 0.1)' : 'rgba(113, 113, 122, 0.13)'}
              placement={isRinging ? 'bottom' : 'center'}
            />
          </div>
          <span
            className={`call-card__verified absolute inset-x-0 top-5 z-10 flex items-center justify-center gap-0.5 text-[10px] font-medium transition-[color,filter] duration-300 ${
              isRinging && !showPermissionPrompt
                ? 'text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.32)]'
                : 'text-[#a1a1aa] drop-shadow-none'
            }`}
          >
            <NizoVerifiedIcon />
            Nizo Verified
          </span>

          <div className="relative z-[4] flex h-full min-h-0 w-full flex-col">
            <div
              className={
                hasActiveMedia
                  ? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-12 pb-4'
                  : 'flex min-h-0 flex-1 flex-col items-center justify-center px-6 pt-12 pb-5 text-center'
              }
            >
              {showPermissionPrompt ? (
                <div className="call-card__permission-panel flex w-full max-w-[300px] flex-col items-center rounded-[18px] border border-white/75 bg-white/80 px-5 py-6 shadow-[0_18px_50px_rgba(24,24,27,0.16),0_2px_8px_rgba(24,24,27,0.08)] backdrop-blur-2xl">
                  <h1 className="!m-0 max-w-[260px] !text-[22px] !font-semibold !leading-[1.15] !tracking-[-0.035em] text-[#18181b]">
                    {call.type === 'VIDEO' ? 'Camera & Microphone' : 'Microphone Access'}
                  </h1>
                  <p className="m-0 mt-3 max-w-[250px] text-[12px] leading-[1.55] text-[#71717a]">
                    {call.type === 'VIDEO'
                      ? 'Allow access so the event team can see and hear you. Your browser will ask once.'
                      : 'Allow access so the event team can hear you. Your browser will ask once.'}
                  </p>

                  {permissionError ? (
                    <p
                      className="m-0 mt-4 w-full rounded-[10px] border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5 text-left text-[11px] leading-4 text-[#be123c]"
                      role="alert"
                    >
                      {permissionError}
                    </p>
                  ) : null}

                  <button
                    className="call-card__permission-action mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#18181b] px-4 text-[13px] font-semibold text-white shadow-[0_7px_18px_rgba(24,24,27,0.2)] transition-[transform,background-color,box-shadow] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-wait disabled:opacity-50"
                    disabled={callMedia.isCapturing || !callMedia.room}
                    onClick={acceptCall}
                    type="button"
                  >
                    {call.type === 'VIDEO' ? (
                      <VideoCameraIcon aria-hidden="true" size={17} weight="fill" />
                    ) : (
                      <MicrophoneIcon aria-hidden="true" size={17} weight="fill" />
                    )}
                    {callMedia.isCapturing
                      ? 'Requesting access…'
                      : call.type === 'VIDEO'
                        ? 'Allow camera & microphone'
                        : 'Allow microphone'}
                  </button>
                </div>
              ) : hasActiveMedia ? (
                <div className="w-full">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div className="text-left">
                      <h1 className="!m-0 !text-[19px] !font-semibold !leading-[1.25] !tracking-[-0.025em] text-[#18181b]">
                        {callHeading(call, mediaConnected)}
                      </h1>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-[#16835b]">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" />
                      Live
                    </span>
                  </div>
                  {media && callMedia.room ? (
                    <LiveKitMediaRoom
                      agentName={callerName}
                      call={call}
                      localTracks={callMedia.localTracks}
                      media={media}
                      onConnected={() => setConnectedMediaCallId(call.id)}
                      onEnd={endCall}
                      room={callMedia.room}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="call-card__hero flex flex-col items-center">
                  <span aria-hidden="true" className="h-72 shrink-0" />
                  <span className="sr-only">
                    {callerName}, {call.type === 'VIDEO' ? 'video call' : 'audio call'}
                  </span>
                  <p className="m-0 mt-5 text-[12px] font-medium text-[#71717a]">
                    {isRinging
                      ? `Incoming ${call.type === 'VIDEO' ? 'Video' : 'Voice'} Call`
                      : 'Call status'}
                  </p>
                  <h1 className="!m-0 mt-2 max-w-[290px] !text-[25px] !font-semibold !leading-[1.18] !tracking-[-0.04em] text-[#18181b]">
                    {isRinging
                      ? 'Event Team Is Calling To Guide You'
                      : callHeading(call, mediaConnected)}
                  </h1>
                  {!isRinging ? (
                    <p className="m-0 mt-3 max-w-[270px] text-[13px] leading-5 text-[#71717a]">
                      {callCopy(call, Boolean(media), mediaConnected)}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {isRinging ? (
              !isPermissionPromptOpen ? (
                <div className="call-card__actions flex justify-center gap-4 px-6 pb-5">
                  <button
                    className="inline-flex min-h-10 w-[120px] items-center justify-center gap-2 rounded-[10px] border border-[#dc2626] bg-[#dc2626] px-2.5 text-xs font-semibold text-white shadow-[0_2px_4px_rgba(127,29,29,0.14)] transition-[transform,box-shadow,background-color] hover:bg-[#c81e1e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dc2626] active:translate-y-px active:shadow-none"
                    onClick={declineCall}
                    type="button"
                  >
                    <DeclineCallIcon />
                    Decline
                  </button>
                  <button
                    className="inline-flex min-h-10 w-[120px] items-center justify-center gap-2 rounded-[10px] border border-[#16a34a] bg-[#16a34a] px-2.5 text-xs font-semibold text-white shadow-[0_2px_4px_rgba(20,83,45,0.14)] transition-[transform,box-shadow,background-color] hover:bg-[#158f43] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16a34a] active:translate-y-px active:shadow-none disabled:cursor-wait disabled:opacity-50"
                    disabled={callMedia.isCapturing || !callMedia.room}
                    onClick={() => {
                      setPermissionError(null);
                      setIsPermissionPromptOpen(true);
                    }}
                    type="button"
                  >
                    <AnswerCallIcon />
                    Accept call
                  </button>
                </div>
              ) : null
            ) : null}

            <div className="call-card__footer flex items-center justify-center gap-1 px-5 py-3 text-[10px] font-medium text-[#a1a1aa]">
              <EncryptedCallIcon />
              Private Encrypted Call
            </div>
          </div>
        </section>
      ) : null}

      <style jsx>{`
        :global(html),
        :global(body) {
          background: transparent !important;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }
        :global(body) {
          color-scheme: light;
          font-family:
            var(--font-google-sans),
            'Google Sans',
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            sans-serif;
        }
        .call-card__verified {
          animation: call-verified-in 260ms cubic-bezier(0.23, 1, 0.32, 1) 280ms both;
        }
        .call-card__portrait-blend {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0) 46%,
            rgba(255, 255, 255, 0.14) 55%,
            rgba(255, 255, 255, 0.62) 67%,
            rgba(255, 255, 255, 0.94) 79%,
            #fff 88%,
            #fff 100%
          );
        }
        .call-card__portrait-media {
          filter: blur(0) saturate(1);
          transform: scale(1);
          transition:
            filter 360ms cubic-bezier(0.65, 0, 0.35, 1),
            transform 360ms cubic-bezier(0.65, 0, 0.35, 1);
        }
        .call-card__portrait-media--permission {
          filter: blur(11px) saturate(0.78);
          transform: scale(1.06);
        }
        .call-card__permission-veil {
          animation: call-permission-veil-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.3) 0%,
            rgba(255, 255, 255, 0.42) 42%,
            rgba(255, 255, 255, 0.68) 100%
          );
        }
        .call-card__permission-panel {
          animation: call-permission-panel-in 300ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .call-card__permission-action:active {
          box-shadow: 0 2px 7px rgba(24, 24, 27, 0.16);
          transform: scale(0.98);
        }
        @media (hover: hover) and (pointer: fine) {
          .call-card__permission-action:not(:disabled):hover {
            background: #000;
            box-shadow: 0 9px 22px rgba(24, 24, 27, 0.26);
            transform: translateY(-1px);
          }
        }
        .call-card__hero {
          animation: call-hero-in 340ms cubic-bezier(0.23, 1, 0.32, 1) 330ms both;
        }
        .call-card__actions {
          animation: call-actions-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 420ms both;
        }
        .call-card__footer {
          animation: call-footer-in 240ms cubic-bezier(0.23, 1, 0.32, 1) 460ms both;
        }
        @keyframes call-verified-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes call-hero-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes call-actions-in {
          from {
            opacity: 0;
            transform: translateY(7px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes call-footer-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes call-permission-veil-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes call-permission-panel-in {
          from {
            opacity: 0;
            transform: translateY(9px) scale(0.975);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .call-card__verified,
          .call-card__hero,
          .call-card__actions,
          .call-card__footer,
          .call-card__permission-panel,
          .call-card__permission-veil {
            animation: none;
          }
          .call-card__portrait-media,
          .call-card__permission-action,
          .call-card__verified {
            transition: none;
          }
        }
      `}</style>
    </RealtimeProvider>
  );
}
