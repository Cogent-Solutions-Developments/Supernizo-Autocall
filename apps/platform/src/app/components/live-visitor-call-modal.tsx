'use client';

import { createRealtime } from '@upstash/realtime/client';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  ApiErrorEnvelopeSchema,
  CallSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type CallType,
  type LiveKitTokenResponse,
  type VisitorPresenceSnapshot,
} from '@supernizo/shared';

import { shouldIgnoreCallUpdate } from '../widget/call/call-end-state';
import { DashboardCallMediaRoom } from './dashboard-call-media-room';

const CallResponseSchema = z.object({
  data: CallSchema,
  media: LiveKitTokenResponseSchema.optional(),
});
const { useRealtime } = createRealtime<{
  call: { status: z.ZodObject<{ call: typeof CallSchema }> };
}>();

type LiveVisitorCallModalProps = Readonly<{
  callType: CallType;
  canCall: boolean;
  onClose: () => void;
  siteId: string;
  visitor: VisitorPresenceSnapshot;
}>;

export function LiveVisitorCallModal({
  callType,
  canCall,
  onClose,
  siteId,
  visitor,
}: LiveVisitorCallModalProps) {
  const [call, setCall] = useState<Call | null>(null);
  const [agentMedia, setAgentMedia] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedMediaCallId, setConnectedMediaCallId] = useState<string | null>(null);
  const callRequestStarted = useRef(false);
  const endingCallId = useRef<string | null>(null);

  useRealtime({
    channels: call ? [`call:${call.id}`] : [],
    events: ['call.status'],
    onData: ({ data }) => {
      if (!shouldIgnoreCallUpdate(data.call.id, endingCallId.current)) setCall(data.call);
    },
  });

  useEffect(() => {
    if (!canCall || callRequestStarted.current) return;
    callRequestStarted.current = true;
    void fetch('/api/calls', {
      body: JSON.stringify({ siteId, type: callType, visitorId: visitor.visitorId }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = ApiErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
          if (error.success) {
            throw new Error(`${error.data.error.message} (request ${error.data.error.requestId})`);
          }
          throw new Error('The call could not be started.');
        }
        return CallResponseSchema.parse(await response.json());
      })
      .then((response) => {
        setCall(response.data);
        setAgentMedia(response.media ?? null);
      })
      .catch((error: unknown) => {
        callRequestStarted.current = false;
        setError(error instanceof Error ? error.message : 'The call could not be started.');
      });
  }, [callType, canCall, siteId, visitor.visitorId]);

  useEffect(() => {
    if (call?.status !== 'RINGING') return;
    let active = true;
    const refresh = () => {
      void fetch(`/api/calls/${call.id}`, { credentials: 'same-origin' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Call status could not be refreshed.');
          return CallResponseSchema.parse(await response.json());
        })
        .then((response) => {
          if (active) setCall(response.data);
        })
        .catch(() => active && setError('Call status could not be refreshed.'));
    };
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [call]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  async function cancel(): Promise<void> {
    if (!call) return;
    const response = await fetch(`/api/calls/${call.id}/cancel`, {
      credentials: 'same-origin',
      method: 'POST',
    });
    if (!response.ok) {
      setError('The call could not be cancelled.');
      return;
    }
    const parsed = CallResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      setCall(parsed.data.data);
      if (parsed.data.data.status === 'CANCELLED') setAgentMedia(null);
    }
  }

  const callIsTerminal =
    call !== null && ['CANCELLED', 'ENDED', 'FAILED', 'MISSED', 'REJECTED'].includes(call.status);
  const callMediaActive =
    call !== null && ['ACCEPTED', 'CONNECTING', 'ACTIVE'].includes(call.status);

  return (
    <div
      aria-labelledby="live-call-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
      role="dialog"
    >
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-blue-600 uppercase">Call</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950" id="live-call-title">
              {callType === 'VIDEO' ? 'Video' : 'Audio'} call to {visitor.city ?? 'visitor'}
            </h2>
          </div>
          <button
            aria-label="Close call"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {!call && !error ? <p className="text-sm text-slate-600">Starting secure ring…</p> : null}
          {call ? (
            <>
              <p className="font-semibold text-slate-950">
                {connectedMediaCallId === call.id ? 'CONNECTED' : call.status}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                The visitor must accept before any media permission is requested.
              </p>
            </>
          ) : null}
          {call && !callIsTerminal ? (
            <DashboardCallMediaRoom
              active={callMediaActive}
              call={call}
              initialMedia={agentMedia}
              onConnected={() => setConnectedMediaCallId(call.id)}
              onEnded={() => {
                endingCallId.current = call.id;
                setConnectedMediaCallId(null);
                setAgentMedia(null);
                setCall(null);
                setError('Call ended.');
              }}
            />
          ) : null}
        </div>
        {call && ['RINGING', 'ACCEPTED', 'CONNECTING'].includes(call.status) ? (
          <button
            className="mt-5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            onClick={() => void cancel()}
            type="button"
          >
            Cancel call
          </button>
        ) : null}
      </section>
    </div>
  );
}
