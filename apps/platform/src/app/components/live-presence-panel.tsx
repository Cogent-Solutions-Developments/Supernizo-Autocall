'use client';

import { createRealtime } from '@upstash/realtime/client';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import {
  VisitorPresenceSnapshotSchema,
  type SiteSettings,
  type VisitorPresenceSnapshot,
} from '@supernizo/shared';

type ClientRealtimeSchema = {
  visitor: {
    online: z.ZodObject<{ visitor: typeof VisitorPresenceSnapshotSchema }>;
    updated: z.ZodObject<{ visitor: typeof VisitorPresenceSnapshotSchema }>;
  };
};

const { useRealtime } = createRealtime<ClientRealtimeSchema>();
const LiveResponseSchema = z.object({ data: z.array(VisitorPresenceSnapshotSchema) });

type LivePresencePanelProps = Readonly<{
  initialSiteId: string | undefined;
  sites: SiteSettings[];
}>;

function upsertVisitor(
  visitors: VisitorPresenceSnapshot[],
  visitor: VisitorPresenceSnapshot,
): VisitorPresenceSnapshot[] {
  return [visitor, ...visitors.filter((candidate) => candidate.visitorId !== visitor.visitorId)];
}

export function LivePresencePanel({ initialSiteId, sites }: LivePresencePanelProps) {
  const [siteId, setSiteId] = useState(initialSiteId ?? '');
  const [visitors, setVisitors] = useState<VisitorPresenceSnapshot[]>([]);
  const [message, setMessage] = useState('Loading live visitors…');

  const { status } = useRealtime({
    channels: siteId ? [`site:${siteId}`] : [],
    events: ['visitor.online', 'visitor.updated'],
    onData: ({ data }) => setVisitors((current) => upsertVisitor(current, data.visitor)),
  });

  useEffect(() => {
    if (!siteId) {
      return;
    }

    let active = true;
    void fetch(`/api/dashboard/sites/${siteId}/live`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load live visitors.');
        }
        return LiveResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (active) {
          setVisitors(response.data);
          setMessage('');
        }
      })
      .catch(() => {
        if (active) {
          setMessage('Could not load live visitors.');
        }
      });

    return () => {
      active = false;
    };
  }, [siteId]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Live visitor proof</h2>
          <p className="mt-1 text-sm text-slate-600">Realtime status: {status}</p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Site
          <select
            className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"
            onChange={(event) => setSiteId(event.target.value)}
            value={siteId}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message ? <p className="mt-5 text-sm text-slate-600">{message}</p> : null}
      <ul className="mt-5 grid gap-3">
        {visitors.map((visitor) => (
          <li className="rounded-lg bg-slate-50 p-4 text-sm" key={visitor.visitorId}>
            <p className="font-medium text-slate-900">{visitor.currentUrl ?? 'Unknown page'}</p>
            <p className="mt-1 text-slate-600">
              {visitor.deviceType ?? 'Unknown device'} · active {visitor.activeDurationSeconds}s
            </p>
          </li>
        ))}
      </ul>
      {!message && visitors.length === 0 ? (
        <p className="mt-5 text-sm text-slate-600">No visitors are currently online.</p>
      ) : null}
    </section>
  );
}
