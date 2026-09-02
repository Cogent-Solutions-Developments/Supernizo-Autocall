'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';

import {
  LiveKitTokenResponseSchema,
  type Call,
  type LiveKitTokenResponse,
} from '@supernizo/shared';

import { LiveKitMediaRoom } from './livekit-media-room';

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
  call,
  onConnected,
  onEnded,
}: Readonly<{ call: Call; onConnected?: () => void; onEnded: () => void }>) {
  const [media, setMedia] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/livekit/token', {
      body: JSON.stringify({ callId: call.id, participantRole: 'AGENT' }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
      .then(parseTokenResponse)
      .then((response) => {
        if (active) setMedia(response);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Unable to obtain a media token.');
      });
    return () => {
      active = false;
    };
  }, [call.id]);

  function endCall(): void {
    onEnded();
    void fetch(`/api/calls/${call.id}/end`, {
      credentials: 'same-origin',
      keepalive: true,
      method: 'POST',
    }).catch(() => undefined);
  }

  if (error) return <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  if (!media) return <p className="mt-4 text-sm text-slate-600">Preparing secure media…</p>;
  return (
    <LiveKitMediaRoom
      call={call}
      media={media}
      {...(onConnected ? { onConnected } : {})}
      onEnd={endCall}
    />
  );
}
