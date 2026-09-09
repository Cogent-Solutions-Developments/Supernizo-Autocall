import { WorkspaceSelect } from '@/app/components/workspace-select';
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
  const sites = await listSitesForUser(user.role);
  const siteId = scalar(query.siteId) ?? sites.at(0)?.id;
  if (!siteId || !IdSchema.safeParse(siteId).success) notFound();
  await requireSiteAccess(siteId);
  const [calls, agents] = await Promise.all([
    listCallHistory(siteId, query),
    listAgentsForSite(siteId),
  ]);

  return (
    <div className="grid gap-8">
      <section className="workspace-page-heading">
        <h1 className="mt-2 text-3xl font-light tracking-tight text-strong">Call history</h1>
        <p className="mt-2 text-muted">Durable call outcomes across your approved sites.</p>
      </section>
      <form className="workspace-panel grid gap-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <WorkspaceSelect
            aria-label="Site"
            name="siteId"
            defaultValue={siteId}
            options={sites.map((site) => ({ value: site.id, label: site.name }))}
          />
          <WorkspaceSelect
            aria-label="Agent"
            name="agentId"
            defaultValue={scalar(query.agentId) ?? ''}
            options={[
              { value: '', label: 'All agents' },
              ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
            ]}
          />
          <WorkspaceSelect
            aria-label="Status"
            name="status"
            defaultValue={scalar(query.status) ?? ''}
            options={[
              { value: '', label: 'All statuses' },
              ...[
                'RINGING',
                'ACCEPTED',
                'CONNECTING',
                'ACTIVE',
                'ENDED',
                'REJECTED',
                'MISSED',
                'FAILED',
                'CANCELLED',
              ].map((status) => ({
                value: status,
                label: status.charAt(0) + status.slice(1).toLowerCase(),
              })),
            ]}
          />
          <WorkspaceSelect
            aria-label="Call type"
            name="type"
            defaultValue={scalar(query.type) ?? ''}
            options={[
              { value: '', label: 'Audio & video' },
              { value: 'AUDIO', label: 'Audio' },
              { value: 'VIDEO', label: 'Video' },
            ]}
          />
        </div>
        <div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end lg:ml-auto lg:w-[40rem]">
          <label className="grid min-w-0 gap-2 text-xs text-muted">
            From date
            <input
              className="workspace-filter h-11 w-full text-sm text-body"
              defaultValue={scalar(query.from)}
              name="from"
              type="date"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-xs text-muted">
            To date
            <input
              className="workspace-filter h-11 w-full text-sm text-body"
              defaultValue={scalar(query.to)}
              name="to"
              type="date"
            />
          </label>
          <button className="workspace-button workspace-button-primary h-11 px-6" type="submit">
            Filter
          </button>
        </div>
      </form>
      <section className="overflow-hidden workspace-panel">
        <div className="workspace-table-scroll">
          <table className="workspace-table min-w-[850px]">
            <thead>
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
                <tr className="group" key={call.callId}>
                  <td className="px-5 py-4">{formatDate(call.requestedAt)}</td>
                  <td className="px-4 py-4">{call.siteName}</td>
                  <td className="px-4 py-4">{call.agentName ?? 'Unassigned'}</td>
                  <td className="px-4 py-4">{call.type}</td>
                  <td className="px-4 py-4 font-medium">
                    <span className="workspace-status">
                      {call.status.toLowerCase().replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4">{duration(call.durationSeconds)}</td>
                  <td className="px-5 py-4 text-muted">
                    {call.failureReason ?? 'Completed or still in progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {calls.length === 0 ? (
          <p className="workspace-table-empty">No calls match these filters.</p>
        ) : null}
      </section>
    </div>
  );
}
