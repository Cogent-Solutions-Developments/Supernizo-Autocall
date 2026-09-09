import Link from 'next/link';
import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { DashboardChatPane } from '@/app/components/dashboard-chat-pane';
import { requireSiteAccess } from '@/server/auth/access';
import { getLiveVisitor } from '@/server/services/live-presence-service';
import { getVisitorProfile } from '@/server/services/visitor-insights-service';
import { listVisitorCallHistory } from '@/server/services/call-history-service';
import { chatThreadBelongsToVisitor } from '@/server/services/chat-service';

type VisitorPageProps = Readonly<{
  params: Promise<{ visitorId: string }>;
  searchParams: Promise<{
    cursor?: string | string[];
    siteId?: string | string[];
    threadId?: string | string[];
  }>;
}>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formatActiveSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s active`;
}

export const dynamic = 'force-dynamic';

export default async function VisitorProfilePage({ params, searchParams }: VisitorPageProps) {
  const [{ visitorId: rawVisitorId }, query] = await Promise.all([params, searchParams]);
  const visitorId = IdSchema.safeParse(rawVisitorId);
  const siteId = IdSchema.safeParse(scalar(query.siteId));
  const requestedThreadId = scalar(query.threadId);
  const threadId = requestedThreadId ? IdSchema.safeParse(requestedThreadId) : null;
  if (!visitorId.success || !siteId.success || (threadId && !threadId.success)) notFound();

  const siteAccess = await requireSiteAccess(siteId.data);
  const profile = await getVisitorProfile(siteId.data, visitorId.data, {
    cursor: scalar(query.cursor),
    limit: 25,
  });
  if (!profile) notFound();
  if (
    threadId?.success &&
    !(await chatThreadBelongsToVisitor(threadId.data, siteId.data, visitorId.data))
  ) {
    notFound();
  }

  const [onlineSnapshot, callHistory] = await Promise.all([
    getLiveVisitor(siteId.data, visitorId.data),
    listVisitorCallHistory(siteId.data, visitorId.data),
  ]);
  const nextTimelineHref = profile.timeline.nextCursor
    ? `/dashboard/visitors/${visitorId.data}?siteId=${siteId.data}&cursor=${encodeURIComponent(profile.timeline.nextCursor)}`
    : null;

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm font-medium text-accent hover:text-accent"
            href={`/dashboard/live?siteId=${siteId.data}`}
          >
            ← Back to live visitors
          </Link>
          <p className="mt-5 text-sm font-semibold tracking-[0.16em] text-accent uppercase">
            Visitor profile
          </p>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-strong">Anonymous visitor</h1>
          <p className="mt-2 text-muted">
            First seen {formatDate(profile.firstSeenAt)} · {profile.totalVisits} total visits
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            onlineSnapshot ? 'bg-emerald-400/10 text-emerald-300' : 'bg-surface-hover text-body'
          }`}
        >
          {onlineSnapshot ? 'Online now' : 'Offline'}
        </span>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="workspace-panel p-5">
          <p className="text-sm text-muted">Last seen</p>
          <p className="mt-2 font-semibold text-strong">{formatDate(profile.lastSeenAt)}</p>
        </article>
        <article className="workspace-panel p-5">
          <p className="text-sm text-muted">Current session active time</p>
          <p className="mt-2 font-semibold text-strong">
            {profile.currentSession
              ? formatActiveSeconds(profile.currentSession.activeDurationSeconds)
              : 'No session data'}
          </p>
          <p className="mt-1 text-xs text-muted">Active time excludes idle/background time.</p>
        </article>
        <article className="workspace-panel p-5">
          <p className="text-sm text-muted">Approximate location</p>
          <p className="mt-2 font-semibold text-strong">
            {profile.currentSession?.city ?? 'Unknown city'},{' '}
            {profile.currentSession?.country ?? 'Unknown country'}
          </p>
        </article>
        <article className="workspace-panel p-5">
          <p className="text-sm text-muted">Device</p>
          <p className="mt-2 font-semibold text-strong">
            {profile.currentSession?.deviceType ??
              profile.currentSession?.browserName ??
              'Unknown device'}
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="workspace-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-strong">Activity timeline</h2>
              <p className="mt-1 text-sm text-muted">
                Newest first. Page entries show active time and maximum scroll depth.
              </p>
            </div>
          </div>
          <ol className="mt-6 grid gap-4 border-l border-line pl-5">
            {profile.timeline.entries.map((entry) => (
              <li className="relative" key={`${entry.kind}-${entry.id}`}>
                <span className="absolute top-2 -left-[1.78rem] h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
                <p className="text-sm font-semibold text-strong">{entry.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {entry.kind === 'page_view'
                    ? `${entry.path ?? 'Page view'} · ${formatActiveSeconds(entry.activeDurationSeconds ?? 0)} · ${entry.maxScrollPercent ?? 0}% scroll`
                    : `${entry.type.replaceAll('_', ' ')} event`}
                </p>
                <time className="mt-1 block text-xs text-muted">
                  {formatDate(entry.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
          {profile.timeline.entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No page views or meaningful events yet.
            </p>
          ) : null}
          {nextTimelineHref ? (
            <Link
              className="mt-6 inline-flex rounded-lg border border-line px-4 py-2 text-sm font-medium text-body hover:bg-surface-muted"
              href={nextTimelineHref}
            >
              Load earlier activity
            </Link>
          ) : null}
        </article>

        <aside className="grid content-start gap-5">
          <article className="workspace-panel p-5">
            <h2 className="font-semibold text-strong">Attribution</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted">Source / medium</dt>
                <dd className="mt-1 font-medium text-strong">
                  {profile.attribution.source ?? 'Direct'} / {profile.attribution.medium ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Campaign</dt>
                <dd className="mt-1 break-words font-medium text-strong">
                  {profile.attribution.campaign ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Referrer</dt>
                <dd className="mt-1 break-all font-medium text-strong">
                  {profile.attribution.referrer ?? 'Direct'}
                </dd>
              </div>
            </dl>
          </article>
          <article className="workspace-panel p-5">
            <h2 className="font-semibold text-strong">Known identity</h2>
            {profile.identities.length ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {profile.identities.map((identity) => (
                  <li
                    key={`${identity.provider}-${identity.email ?? identity.displayName ?? 'identity'}`}
                  >
                    <p className="font-medium text-strong">
                      {identity.displayName ?? identity.email ?? 'Linked contact'}
                    </p>
                    <p className="text-muted">{identity.provider}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No CRM identity has been linked.</p>
            )}
          </article>
          <DashboardChatPane
            canSend={siteAccess.siteRole === 'ADMIN' || siteAccess.siteRole === 'AGENT'}
            initialThreadId={threadId?.success ? threadId.data : profile.latestChatThreadId}
            siteId={siteId.data}
            visitorId={visitorId.data}
          />
          <article className="workspace-panel p-5">
            <h2 className="font-semibold text-strong">Calls</h2>
            {callHistory.length ? (
              <ul className="mt-3 grid gap-3 text-sm">
                {callHistory.map((call) => (
                  <li className="rounded-lg bg-surface-muted p-3" key={call.callId}>
                    <p className="font-medium text-strong">
                      {call.type} · {call.status}
                    </p>
                    <p className="mt-1 text-muted">
                      {formatDate(call.requestedAt)} ·{' '}
                      {call.durationSeconds === null
                        ? 'No connected duration'
                        : formatActiveSeconds(call.durationSeconds)}
                    </p>
                    {call.failureReason ? (
                      <p className="mt-1 text-rose-300">{call.failureReason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No call history yet.</p>
            )}
          </article>
        </aside>
      </section>

      <section className="workspace-panel p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-strong">Previous sessions</h2>
        {profile.previousSessions.length ? (
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profile.previousSessions.map((session) => (
              <li className="rounded-lg bg-surface-muted p-4 text-sm" key={session.sessionId}>
                <p className="font-medium text-strong">{formatDate(session.startedAt)}</p>
                <p className="mt-1 text-muted">
                  {formatActiveSeconds(session.activeDurationSeconds)}
                </p>
                <p className="mt-1 truncate text-muted">
                  {session.currentUrl ?? 'No page recorded'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No previous sessions recorded.</p>
        )}
      </section>
    </div>
  );
}
