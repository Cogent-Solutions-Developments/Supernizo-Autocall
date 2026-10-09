'use client';

import { CalendarDays, Radar, Headset, ChartSpline, ArrowUpRight, Settings } from 'lucide-react';
import type { UserProfile } from '@supernizo/shared';
import { DashboardProfileSettings } from './dashboard-profile-settings';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  dashboardHref,
  dashboardSections,
  isDashboardSectionActive,
} from '@/lib/dashboard-navigation';
import { FloatingDock, type FloatingDockItem } from './heavy-floating-dock';

const icons = { events: CalendarDays, live: Radar, calls: Headset, analytics: ChartSpline };

export function DashboardDock({
  returnTo,
  initialProfile,
}: Readonly<{ returnTo: string | undefined; initialProfile: UserProfile }>) {
  const pathname = usePathname();
  const siteId = useSearchParams().get('siteId');
  const sections = pathname === '/dashboard' ? [] : dashboardSections;
  const items: FloatingDockItem[] = sections.map(({ href, label, icon }) => {
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
        <DashboardProfileSettings
          initialProfile={initialProfile}
          renderTrigger={(openSettings) => (
            <FloatingDock
              key={pathname}
              items={[
                ...items,
                {
                  title: 'Profile settings',
                  icon: <Settings aria-hidden="true" className="h-full w-full" />,
                  onClick: openSettings,
                },
              ]}
            />
          )}
        />
      </div>
    </div>
  );
}
