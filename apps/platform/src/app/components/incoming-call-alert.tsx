'use client';

import { PhoneCall, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { CallSchema, type Call } from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

const IncomingCallsResponseSchema = z.object({ data: z.object({ calls: z.array(CallSchema) }) });

export function IncomingCallAlert({ initialCalls }: Readonly<{ initialCalls: Call[] }>) {
  const router = useRouter();
  const [calls, setCalls] = useState(initialCalls);

  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetchAppApi('/api/calls/incoming', { credentials: 'same-origin' });
        if (!response.ok) return;
        const { data } = IncomingCallsResponseSchema.parse(await response.json());
        if (active) setCalls(data.calls);
      } catch {
        // Call notification delivery must not make the dashboard unusable.
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const call = calls.at(0);
  if (!call) return null;

  return (
    <button
      aria-label="Open incoming visitor call"
      className="fixed top-24 left-1/2 z-[70] flex w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-[1.4rem] border border-emerald-400/30 bg-surface/95 p-3.5 text-left shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-emerald-300/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-surface-hover"
      onClick={() => router.push(`/dashboard/calls/${encodeURIComponent(call.id)}`)}
      type="button"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20">
        {call.type === 'VIDEO' ? (
          <Video aria-hidden="true" size={18} />
        ) : (
          <PhoneCall aria-hidden="true" size={18} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-emerald-300">Incoming visitor call</span>
        <span className="mt-1 block text-sm font-semibold text-strong">
          {call.type === 'VIDEO' ? 'Video call requested' : 'Voice call requested'}
        </span>
        <span className="mt-0.5 block text-sm text-muted">Open to accept and join securely.</span>
      </span>
    </button>
  );
}
