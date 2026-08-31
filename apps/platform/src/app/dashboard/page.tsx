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
        <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Site management
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Register approved website origins and configure which visitor-engagement capabilities are
          available for each site.
        </p>
      </section>
      <SiteManagement canManage={user.role === 'ADMIN'} initialSites={sites} />
    </div>
  );
}
