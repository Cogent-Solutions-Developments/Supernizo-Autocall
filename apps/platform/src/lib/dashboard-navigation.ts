export const dashboardSections = [
  { label: 'Events', href: '/dashboard', icon: 'events' },
  { label: 'Live visitors', href: '/dashboard/live', icon: 'live' },
  { label: 'Calls', href: '/dashboard/calls', icon: 'calls' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: 'analytics' },
] as const;

export function isDashboardSectionActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  if (href === '/dashboard/live' && pathname.startsWith('/dashboard/visitors/')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function dashboardHref(href: string, siteId?: string | null): string {
  return siteId ? `${href}?${new URLSearchParams({ siteId })}` : href;
}
