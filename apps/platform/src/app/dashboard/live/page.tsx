import { LiveVisitorDashboard } from '@/app/components/live-visitor-dashboard';
import { IdSchema } from '@supernizo/shared';
import { notFound } from 'next/navigation';

import { requireUser } from '@/server/auth/access';
import { listLiveVisitorsForSite } from '@/server/services/live-presence-service';
import { listSitesForUser } from '@/server/services/site-service';

export const dynamic = 'force-dynamic';

type LivePresencePageProps = Readonly<{
  searchParams: Promise<{ siteId?: string | string[] }>;
}>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function LivePresencePage({ searchParams }: LivePresencePageProps) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const sites = await listSitesForUser(user.id, user.role);
  const requestedSiteId = scalar(query.siteId);
  const selectedSite = requestedSiteId
    ? sites.find((site) => site.id === requestedSiteId)
    : sites.at(0);

  if (requestedSiteId && !IdSchema.safeParse(requestedSiteId).success) notFound();
  if (requestedSiteId && !selectedSite) notFound();

  const initialVisitors = selectedSite ? await listLiveVisitorsForSite(selectedSite.id) : [];

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Live visitors</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Monitor live engagement signals across your approved sites.
        </p>
      </section>
      <LiveVisitorDashboard
        canSendChat={user.role === 'ADMIN' || user.role === 'AGENT'}
        initialSiteId={selectedSite?.id}
        initialVisitors={initialVisitors}
        sites={sites}
      />
    </div>
  );
}
