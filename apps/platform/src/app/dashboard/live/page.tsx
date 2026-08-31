import { LiveVisitorDashboard } from '@/app/components/live-visitor-dashboard';
import { requireUser } from '@/server/auth/access';
import { listLiveVisitorsForSite } from '@/server/services/live-presence-service';
import { listSitesForUser } from '@/server/services/site-service';

export const dynamic = 'force-dynamic';

export default async function LivePresencePage() {
  const user = await requireUser();
  const sites = await listSitesForUser(user.id, user.role);
  const initialVisitors = sites[0] ? await listLiveVisitorsForSite(sites[0].id) : [];

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
        initialSiteId={sites[0]?.id}
        initialVisitors={initialVisitors}
        sites={sites}
      />
    </div>
  );
}
