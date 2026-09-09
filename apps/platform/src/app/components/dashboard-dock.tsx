'use client';

import { CalendarDays, Radar, Headset, ChartSpline, ArrowUpRight } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  dashboardHref,
  dashboardSections,
  isDashboardSectionActive,
} from '@/lib/dashboard-navigation';
import { FloatingDock, type FloatingDockItem } from './heavy-floating-dock';

const icons = { events: CalendarDays, live: Radar, calls: Headset, analytics: ChartSpline };

export function DashboardDock({ returnTo }: Readonly<{ returnTo: string | undefined }>) {
  const pathname = usePathname();
  const siteId = useSearchParams().get('siteId');
  if (pathname === '/dashboard') return null;

  const items: FloatingDockItem[] = dashboardSections.map(({ href, label, icon }) => {
    const Icon = icons[icon];
    return {
      title: label,
      href: dashboardHref(href, siteId),
      active: isDashboardSectionActive(pathname, href),
      icon: <Icon aria-hidden="true" className="h-full w-full" />,
    };
  });
  if (returnTo)
    items.push({
      title: 'Supernizo',
      href: returnTo,
      icon: <ArrowUpRight className="h-full w-full" />,
    });
  return (
    <div className="heavy-dock-frame">
      <div className="heavy-dock-position">
        <FloatingDock key={pathname} items={items} />
      </div>
    </div>
  );
}
