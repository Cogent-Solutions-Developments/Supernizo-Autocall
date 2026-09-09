import { WorkspaceSelect } from '@/app/components/workspace-select';
import Link from 'next/link';
import { dashboardHref } from '@/lib/dashboard-navigation';
import { notFound } from 'next/navigation';

import { DashboardDateRangeSchema, IdSchema } from '@supernizo/shared';

import { requireSiteAccess, requireUser } from '@/server/auth/access';
import { getSiteAnalytics } from '@/server/services/visitor-insights-service';
import { listSitesForUser } from '@/server/services/site-service';

type AnalyticsPageProps = Readonly<{
  searchParams: Promise<{
    from?: string | string[];
    siteId?: string | string[];
    to?: string | string[];
  }>;
}>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function defaultPeriod(): Readonly<{ from: string; to: string }> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}

function MetricList({
  emptyText,
  items,
}: Readonly<{
  emptyText: string;
  items: ReadonlyArray<Readonly<{ label: string; value: string | number }>>;
}>) {
  if (!items.length) return <p className="mt-4 text-sm text-muted">{emptyText}</p>;

  return (
    <ul className="mt-4 grid gap-3 text-sm">
      {items.map((item) => (
        <li className="flex items-start justify-between gap-3" key={item.label}>
          <span className="min-w-0 break-all text-body">{item.label}</span>
          <span className="shrink-0 font-medium text-strong">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const sites = await listSitesForUser(user.role);
  const rawSiteId = scalar(query.siteId);
  const chosenSite = rawSiteId ? sites.find((site) => site.id === rawSiteId) : sites.at(0);
  if (!chosenSite) notFound();

  const siteId = IdSchema.safeParse(chosenSite.id);
  if (!siteId.success) notFound();
  await requireSiteAccess(siteId.data);

  const rangeCandidate = {
    from: scalar(query.from) ?? defaultPeriod().from,
    to: scalar(query.to) ?? defaultPeriod().to,
  };
  const range = DashboardDateRangeSchema.safeParse(rangeCandidate);
  if (!range.success) notFound();

  const analytics = await getSiteAnalytics(siteId.data, range.data);
  if (!analytics) notFound();

  return (
    <div className="grid gap-8">
      <section className="workspace-page-heading flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mt-2 text-3xl font-light tracking-tight text-strong">
            Visitor engagement
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Site-scoped visitor activity based on active engagement time, not elapsed tab time.
          </p>
        </div>
        <Link
          className="workspace-button workspace-button-primary"
          href={dashboardHref('/dashboard/live', siteId.data)}
        >
          View live visitors →
        </Link>
      </section>

      <form className="grid gap-3 workspace-panel p-4 sm:grid-cols-4" method="get">
        <label className="grid gap-1 text-sm font-medium text-body">
          Site
          <WorkspaceSelect
            aria-label="Site"
            name="siteId"
            defaultValue={siteId.data}
            options={sites.map((site) => ({ value: site.id, label: site.name }))}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-body">
          From
          <input
            className="workspace-filter"
            defaultValue={analytics.period.from}
            name="from"
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-body">
          To
          <input
            className="workspace-filter"
            defaultValue={analytics.period.to}
            name="to"
            type="date"
          />
        </label>
        <button className="workspace-button workspace-button-primary self-end" type="submit">
          Apply range
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Visitors', analytics.totalVisitors],
          ['New visitors', analytics.newVisitors],
          ['Returning visitors', analytics.returningVisitors],
          ['Average active session', formatSeconds(analytics.averageActiveSessionSeconds)],
        ].map(([label, value]) => (
          <article className="workspace-panel p-5" key={label}>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-2xl font-light tracking-tight text-strong">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="workspace-panel p-5">
          <h2 className="text-lg font-medium text-strong">Top landing pages</h2>
          <MetricList
            emptyText="No page views in this period."
            items={analytics.topLandingPages.map((page) => ({
              label: page.path,
              value: page.views,
            }))}
          />
        </article>
        <article className="workspace-panel p-5">
          <h2 className="text-lg font-medium text-strong">Top pages by active time</h2>
          <MetricList
            emptyText="No active page time in this period."
            items={analytics.topActivePages.map((page) => ({
              label: page.path,
              value: formatSeconds(page.activeSeconds),
            }))}
          />
        </article>
        <article className="workspace-panel p-5">
          <h2 className="text-lg font-medium text-strong">Referrers and campaigns</h2>
          <MetricList
            emptyText="No referrers in this period."
            items={analytics.referrers.map((item) => ({ label: item.referrer, value: item.count }))}
          />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="font-medium text-strong">UTM campaigns</h3>
            <MetricList
              emptyText="No campaign data in this period."
              items={analytics.utmCampaigns.map((item) => ({
                label: item.campaign,
                value: item.count,
              }))}
            />
          </div>
        </article>
        <article className="workspace-panel p-5">
          <h2 className="text-lg font-medium text-strong">Country distribution</h2>
          <MetricList
            emptyText="No approximate country data in this period."
            items={analytics.countryDistribution.map((item) => ({
              label: item.country,
              value: item.visitors,
            }))}
          />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="font-medium text-strong">CTA and custom events</h3>
            <MetricList
              emptyText="No configured CTA or custom events in this period."
              items={analytics.ctaEvents.map((item) => ({
                label: `${item.name} (${item.type})`,
                value: item.count,
              }))}
            />
          </div>
        </article>
      </section>
    </div>
  );
}
