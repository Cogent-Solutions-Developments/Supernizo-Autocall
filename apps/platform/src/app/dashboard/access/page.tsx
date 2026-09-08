import { redirect } from 'next/navigation';

import { requireDashboardUser } from '@/server/auth/access';

export const dynamic = 'force-dynamic';

// Keep existing bookmarks working after retiring per-event assignments.
export default async function AccessManagementPage() {
  await requireDashboardUser();
  redirect('/dashboard');
}
