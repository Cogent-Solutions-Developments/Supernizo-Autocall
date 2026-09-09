import { describe, expect, it } from 'vitest';
import { dashboardHref, isDashboardSectionActive } from './dashboard-navigation';

describe('dashboard navigation', () => {
  it('keeps the selected event when navigating to another workspace', () => {
    expect(dashboardHref('/dashboard/calls', 'event-a')).toBe('/dashboard/calls?siteId=event-a');
    expect(dashboardHref('/dashboard/live')).toBe('/dashboard/live');
    expect(dashboardHref('/dashboard', 'event&a')).toBe('/dashboard?siteId=event%26a');
  });
  it('treats a visitor profile as part of live visitors without selecting home', () => {
    expect(isDashboardSectionActive('/dashboard/visitors/visitor-a', '/dashboard/live')).toBe(true);
    expect(isDashboardSectionActive('/dashboard/live', '/dashboard')).toBe(false);
    expect(isDashboardSectionActive('/dashboard/calls', '/dashboard/calls')).toBe(true);
    expect(isDashboardSectionActive('/dashboard/calls-other', '/dashboard/calls')).toBe(false);
  });
});
