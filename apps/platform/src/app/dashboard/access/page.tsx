import { redirect } from 'next/navigation';

import { AccessManagement } from '@/app/components/access-management';
import { withAppBasePath } from '@/lib/app-path';
import { requireUser } from '@/server/auth/access';
import { listAccessManagement } from '@/server/services/access-management-service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Manage access | Supernizo Autocall',
};

export default async function AccessManagementPage() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') {
    redirect(withAppBasePath('/dashboard'));
  }

  const access = await listAccessManagement();

  return <AccessManagement currentUserId={user.id} initialAccess={access} />;
}
