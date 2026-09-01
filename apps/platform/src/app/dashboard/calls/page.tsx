import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { requireUser, requireSiteAccess } from '@/server/auth/access';
import { listAgentsForSite, listCallHistory } from '@/server/services/call-history-service';
import { reconcileStaleCallsForAgent } from '@/server/services/call-service';
import { listSitesForUser } from '@/server/services/site-service';

export const dynamic = 'force-dynamic';

type CallHistoryPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function duration(value: number | null): string {
  if (value === null) return '—';
  return `${Math.floor(value / 60)}m ${String(value % 60).padStart(2, '0')}s`;
}

export default async function CallHistoryPage({ searchParams }: CallHistoryPageProps) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  await reconcileStaleCallsForAgent(user.id);
  const sites = await listSitesForUser(user.id, user.role);
  const siteId = scalar(query.siteId) ?? sites.at(0)?.id;
  if (!siteId || !IdSchema.safeParse(siteId).success) notFound();
  await requireSiteAccess(siteId);
  const [calls, agents] = await Promise.all([
    listCallHistory(siteId, query),
    listAgentsForSite(siteId),
  ]);

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Call history</h1>
        <p className="mt-2 text-slate-600">Durable call outcomes across your approved sites.</p>
      </section>
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <select
          aria-label="Site"
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={siteId}
          name="siteId"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Agent"
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={scalar(query.agentId) ?? ''}
          name="agentId"
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={scalar(query.status) ?? ''}
          name="status"
        >
          <option value="">All statuses</option>
          {[
            'RINGING',
            'ACCEPTED',
            'CONNECTING',
            'ACTIVE',
            'ENDED',
            'REJECTED',
            'MISSED',
            'FAILED',
            'CANCELLED',
          ].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          aria-label="Call type"
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={scalar(query.type) ?? ''}
          name="type"
        >
          <option value="">Audio & video</option>
          <option value="AUDIO">Audio</option>
          <option value="VIDEO">Video</option>
        </select>
        <input
          aria-label="From date"
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={scalar(query.from)}
          name="from"
          type="date"
        />
        <div className="flex gap-2">
          <input
            aria-label="To date"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={scalar(query.to)}
            name="to"
            type="date"
          />
          <button
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Filter
          </button>
        </div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-4">When</th>
                <th className="px-4 py-4">Site</th>
                <th className="px-4 py-4">Agent</th>
                <th className="px-4 py-4">Type</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Duration</th>
                <th className="px-5 py-4">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr className="border-t border-slate-100" key={call.callId}>
                  <td className="px-5 py-4">{formatDate(call.requestedAt)}</td>
                  <td className="px-4 py-4">{call.siteName}</td>
                  <td className="px-4 py-4">{call.agentName ?? 'Unassigned'}</td>
                  <td className="px-4 py-4">{call.type}</td>
                  <td className="px-4 py-4 font-medium">{call.status}</td>
                  <td className="px-4 py-4">{duration(call.durationSeconds)}</td>
                  <td className="px-5 py-4 text-slate-600">
                    {call.failureReason ?? 'Completed or still in progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {calls.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-600">No calls match these filters.</p>
        ) : null}
      </section>
    </div>
  );
}
