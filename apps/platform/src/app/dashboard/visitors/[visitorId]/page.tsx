import Link from 'next/link';
import { notFound } from 'next/navigation';

import { IdSchema } from '@supernizo/shared';

import { DashboardChatPane } from '@/app/components/dashboard-chat-pane';
import { requireSiteAccess } from '@/server/auth/access';
import { getLiveVisitor } from '@/server/services/live-presence-service';
import { getVisitorProfile } from '@/server/services/visitor-insights-service';

type VisitorPageProps = Readonly<{
  params: Promise<{ visitorId: string }>;
  searchParams: Promise<{ cursor?: string | string[]; siteId?: string | string[] }>;
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
  if (!visitorId.success || !siteId.success) notFound();

  const siteAccess = await requireSiteAccess(siteId.data);
  const profile = await getVisitorProfile(siteId.data, visitorId.data, {
    cursor: scalar(query.cursor),
    limit: 25,
  });
  if (!profile) notFound();

  const onlineSnapshot = await getLiveVisitor(siteId.data, visitorId.data);
  const nextTimelineHref = profile.timeline.nextCursor
    ? `/dashboard/visitors/${visitorId.data}?siteId=${siteId.data}&cursor=${encodeURIComponent(profile.timeline.nextCursor)}`
    : null;

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
            href="/dashboard/live"
          >
            ← Back to live visitors
          </Link>
          <p className="mt-5 text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
            Visitor profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Anonymous visitor
          </h1>
          <p className="mt-2 text-slate-600">
            First seen {formatDate(profile.firstSeenAt)} · {profile.totalVisits} total visits
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            onlineSnapshot ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {onlineSnapshot ? 'Online now' : 'Offline'}
        </span>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Last seen</p>
          <p className="mt-2 font-semibold text-slate-950">{formatDate(profile.lastSeenAt)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Current session active time</p>
          <p className="mt-2 font-semibold text-slate-950">
            {profile.currentSession
              ? formatActiveSeconds(profile.currentSession.activeDurationSeconds)
              : 'No session data'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active time excludes idle/background time.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Approximate location</p>
          <p className="mt-2 font-semibold text-slate-950">
            {profile.currentSession?.city ?? 'Unknown city'},{' '}
            {profile.currentSession?.country ?? 'Unknown country'}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Device</p>
          <p className="mt-2 font-semibold text-slate-950">
            {profile.currentSession?.deviceType ??
              profile.currentSession?.browserName ??
              'Unknown device'}
          </p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Activity timeline</h2>
              <p className="mt-1 text-sm text-slate-600">
                Newest first. Page entries show active time and maximum scroll depth.
              </p>
            </div>
          </div>
          <ol className="mt-6 grid gap-4 border-l border-slate-200 pl-5">
            {profile.timeline.entries.map((entry) => (
              <li className="relative" key={`${entry.kind}-${entry.id}`}>
                <span className="absolute top-2 -left-[1.78rem] h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
                <p className="text-sm font-semibold text-slate-950">{entry.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {entry.kind === 'page_view'
                    ? `${entry.path ?? 'Page view'} · ${formatActiveSeconds(entry.activeDurationSeconds ?? 0)} · ${entry.maxScrollPercent ?? 0}% scroll`
                    : `${entry.type.replaceAll('_', ' ')} event`}
                </p>
                <time className="mt-1 block text-xs text-slate-500">
                  {formatDate(entry.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
          {profile.timeline.entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">
              No page views or meaningful events yet.
            </p>
          ) : null}
          {nextTimelineHref ? (
            <Link
              className="mt-6 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={nextTimelineHref}
            >
              Load earlier activity
            </Link>
          ) : null}
        </article>

        <aside className="grid content-start gap-5">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Attribution</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Source / medium</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {profile.attribution.source ?? 'Direct'} / {profile.attribution.medium ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Campaign</dt>
                <dd className="mt-1 break-words font-medium text-slate-900">
                  {profile.attribution.campaign ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Referrer</dt>
                <dd className="mt-1 break-all font-medium text-slate-900">
                  {profile.attribution.referrer ?? 'Direct'}
                </dd>
              </div>
            </dl>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Known identity</h2>
            {profile.identities.length ? (
              <ul className="mt-3 grid gap-2 text-sm">
                {profile.identities.map((identity) => (
                  <li
                    key={`${identity.provider}-${identity.email ?? identity.displayName ?? 'identity'}`}
                  >
                    <p className="font-medium text-slate-900">
                      {identity.displayName ?? identity.email ?? 'Linked contact'}
                    </p>
                    <p className="text-slate-500">{identity.provider}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-600">No CRM identity has been linked.</p>
            )}
          </article>
          <DashboardChatPane
            canSend={siteAccess.siteRole === 'ADMIN' || siteAccess.siteRole === 'AGENT'}
            initialThreadId={profile.latestChatThreadId}
            siteId={siteId.data}
            visitorId={visitorId.data}
          />
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">Calls</h2>
            <p className="mt-3 text-sm text-slate-600">
              No call history yet. Calling arrives in a later phase.
            </p>
          </article>
        </aside>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-slate-950">Previous sessions</h2>
        {profile.previousSessions.length ? (
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profile.previousSessions.map((session) => (
              <li className="rounded-lg bg-slate-50 p-4 text-sm" key={session.sessionId}>
                <p className="font-medium text-slate-900">{formatDate(session.startedAt)}</p>
                <p className="mt-1 text-slate-600">
                  {formatActiveSeconds(session.activeDurationSeconds)}
                </p>
                <p className="mt-1 truncate text-slate-600">
                  {session.currentUrl ?? 'No page recorded'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600">No previous sessions recorded.</p>
        )}
      </section>
    </div>
  );
}
