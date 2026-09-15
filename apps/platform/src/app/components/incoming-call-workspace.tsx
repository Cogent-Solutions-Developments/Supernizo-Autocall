'use client';

import { createRealtime } from '@upstash/realtime/client';
import { Phone, Video } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { CallSchema, type Call } from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import { DashboardCallMediaRoom } from './dashboard-call-media-room';
import {
  canConnectAgentMedia,
  isTerminalCallStatus,
  terminalCallMessage,
} from './incoming-call-workspace-state';

const CallResponseSchema = z.object({ data: CallSchema });
const ErrorResponseSchema = z.object({ error: z.object({ message: z.string().min(1).max(500) }) });
const { useRealtime } = createRealtime<{
  call: { status: z.ZodObject<{ call: typeof CallSchema }> };
}>();

type IncomingCallWorkspaceProps = Readonly<{
  eventName?: string;
  initialCall: Call;
  visitorLocation?: string;
}>;

export function IncomingCallWorkspace({
  eventName,
  initialCall,
  visitorLocation,
}: IncomingCallWorkspaceProps) {
  const [call, setCall] = useState(initialCall);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptedByCurrentAgent, setAcceptedByCurrentAgent] = useState(
    () => initialCall.status !== 'RINGING' && !isTerminalCallStatus(initialCall.status),
  );
  const active = canConnectAgentMedia(call.status, acceptedByCurrentAgent);
  const terminal = isTerminalCallStatus(call.status);
  const acceptedByAnotherAgent =
    !acceptedByCurrentAgent &&
    (call.status === 'ACCEPTED' || call.status === 'CONNECTING' || call.status === 'ACTIVE');

  useRealtime({
    channels: [`call:${call.id}`],
    events: ['call.status'],
    onData: ({ data }) => {
      if (data.call.id !== call.id) return;
      setCall(data.call);
      if (isTerminalCallStatus(data.call.status)) setAcceptedByCurrentAgent(false);
    },
  });

  async function accept(): Promise<void> {
    setAccepting(true);
    setError(null);
    try {
      const response = await fetchAppApi(`/api/calls/${call.id}/agent/accept`, {
        credentials: 'same-origin',
        method: 'POST',
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorResponseSchema.safeParse(body);
        throw new Error(
          parsed.success ? parsed.data.error.message : 'The call could not be accepted.',
        );
      }
      const accepted = CallResponseSchema.parse(body).data;
      setCall((current) => (isTerminalCallStatus(current.status) ? current : accepted));
      setAcceptedByCurrentAgent(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The call could not be accepted.');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <section
      className="workspace-panel mx-auto max-w-3xl p-6 sm:p-8"
      style={{ backgroundColor: 'rgb(11 17 24)' }}
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          {call.type === 'VIDEO' ? (
            <Video aria-hidden="true" size={22} />
          ) : (
            <Phone aria-hidden="true" size={22} />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] text-emerald-300 uppercase">
            Incoming visitor call
          </p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-strong">
            {call.type === 'VIDEO' ? 'Video call requested' : 'Voice call requested'}
          </h1>
          <p className="mt-2 text-muted">Accept to join the visitor in a secure LiveKit room.</p>
          {eventName || visitorLocation ? (
            <dl className="mt-4 grid gap-1.5 text-sm text-muted">
              {eventName ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt>Event</dt>
                  <dd className="font-medium text-strong">{eventName}</dd>
                </div>
              ) : null}
              {visitorLocation ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt>Visitor location</dt>
                  <dd className="font-medium text-strong">{visitorLocation}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>

      {call.status === 'RINGING' ? (
        <button
          className="workspace-button workspace-button-primary mt-7 min-h-12 px-6"
          disabled={accepting}
          onClick={() => void accept()}
          type="button"
        >
          {accepting ? 'Accepting…' : 'Accept call'}
        </button>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : null}
      {acceptedByAnotherAgent ? (
        <p className="mt-6 rounded-lg bg-surface-muted p-4 text-sm text-muted">
          Call was accepted by another agent.
        </p>
      ) : null}
      {terminal ? (
        <p className="mt-6 rounded-lg bg-surface-muted p-4 text-sm text-muted">
          {terminalCallMessage(call.status)}
        </p>
      ) : null}
      <DashboardCallMediaRoom
        active={active}
        call={call}
        initialMedia={null}
        onEnded={() => setCall((current) => ({ ...current, status: 'ENDED' }))}
      />
    </section>
  );
}
