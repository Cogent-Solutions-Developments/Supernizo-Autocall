'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';

import {
  LiveKitTokenResponseSchema,
  type Call,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { useLiveKitCallSession } from '@/client/calls/use-livekit-call-session';

import { LiveKitMediaRoom } from './livekit-media-room';
import { getLiveKitMediaErrorMessage } from './livekit-media-state';

const TokenResponseSchema = z.object({ data: LiveKitTokenResponseSchema });
const ErrorResponseSchema = z.object({
  error: z.object({ message: z.string().min(1).max(500) }),
});

async function parseTokenResponse(response: Response): Promise<LiveKitTokenResponse> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(body);
    throw new Error(error.success ? error.data.error.message : 'Unable to obtain a media token.');
  }
  return TokenResponseSchema.parse(body).data;
}

export function DashboardCallMediaRoom({
  active,
  call,
  initialMedia,
  onConnected,
  onEnded,
}: Readonly<{
  active: boolean;
  call: Call;
  initialMedia: LiveKitTokenResponse | null;
  onConnected?: () => void;
  onEnded: () => void;
}>) {
  const [tokenRequest, setTokenRequest] = useState<
    | Readonly<{
        callId: string;
        error: string | null;
        media: LiveKitTokenResponse | null;
      }>
    | undefined
  >();
  const media = initialMedia ?? (tokenRequest?.callId === call.id ? tokenRequest.media : null);
  const error = initialMedia ? null : tokenRequest?.callId === call.id ? tokenRequest.error : null;
  const session = useLiveKitCallSession(
    media ? { callId: call.id, token: media.token, url: media.url } : null,
  );
  const { captureError, captureLocalTracks, isCapturing, localTracks, releaseLocalTracks, room } =
    session;

  useEffect(() => {
    if (initialMedia) return;

    let mounted = true;
    void fetch('/api/livekit/token', {
      body: JSON.stringify({ callId: call.id, participantRole: 'AGENT' }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
      .then(parseTokenResponse)
      .then((response) => {
        if (mounted) setTokenRequest({ callId: call.id, error: null, media: response });
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setTokenRequest({
          callId: call.id,
          error: reason instanceof Error ? reason.message : 'Unable to obtain a media token.',
          media: null,
        });
      });
    return () => {
      mounted = false;
    };
  }, [call.id, initialMedia]);

  useEffect(() => {
    if (!active || !room || isCapturing || localTracks.length > 0 || captureError) {
      return;
    }
    void captureLocalTracks(call.type).catch(() => undefined);
  }, [active, call.type, captureError, captureLocalTracks, isCapturing, localTracks.length, room]);

  function endCall(): void {
    onEnded();
    void fetch(`/api/calls/${call.id}/end`, {
      credentials: 'same-origin',
      keepalive: true,
      method: 'POST',
    }).catch(() => undefined);
  }

  if (!active) return null;
  if (error) {
    return <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  }
  if (!media || !room) {
    return <p className="mt-4 text-sm text-slate-600">Preparing secure media...</p>;
  }

  return (
    <>
      {captureError ? (
        <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <p>{getLiveKitMediaErrorMessage(captureError)}</p>
          <button
            className="mt-2 font-semibold underline"
            onClick={() => {
              releaseLocalTracks();
              void captureLocalTracks(call.type).catch(() => undefined);
            }}
            type="button"
          >
            Try media again
          </button>
        </div>
      ) : null}
      <LiveKitMediaRoom
        call={call}
        localTracks={localTracks}
        media={media}
        {...(onConnected ? { onConnected } : {})}
        onEnd={endCall}
        room={room}
      />
    </>
  );
}
