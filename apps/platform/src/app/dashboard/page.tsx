import { SiteManagement } from '@/app/components/site-management';
import { requireUser } from '@/server/auth/access';
import { listSitesForUser } from '@/server/services/site-service';

export const metadata = {
  title: 'Dashboard | Supernizo Autocall',
};

export default async function DashboardPage() {
  const user = await requireUser();
  const sites = await listSitesForUser(user.id, user.role);

  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
          Operations dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Your events, all in one place.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Start by choosing an event. From there you can watch live visitor activity, handle calls
          and review performance.
        </p>
      </section>
      <SiteManagement canManage={user.role === 'ADMIN'} initialSites={sites} />
    </div>
  );
}
