import { SiteManagement } from '@/app/components/site-management';
import { requireUser } from '@/server/auth/access';
import { listSitesForUser } from '@/server/services/site-service';

export const metadata = { title: 'Autocall | Supernizo' };

export default async function DashboardPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ siteId?: string }> }>) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const sites = await listSitesForUser(user.role);
  return (
    <div className="grid gap-8">
      <h1 className="sr-only">Autocall events</h1>
      <SiteManagement
        canManage={user.role === 'ADMIN'}
        initialSites={sites}
        initialSiteId={sites.find((site) => site.id === query.siteId)?.id}
      />
    </div>
  );
}
