import 'server-only';

import { IdSchema } from '@supernizo/shared';
import { z } from 'zod';

import { ValidationError } from '@/server/errors/app-error';

export const NotificationDeepLinkSchema = z
  .object({
    siteId: IdSchema,
    threadId: IdSchema,
    visitorId: IdSchema,
  })
  .strict();

export type NotificationDeepLink = z.infer<typeof NotificationDeepLinkSchema>;

export function notificationDeepLinkFromValues(
  values: Readonly<Record<string, string | string[] | undefined>>,
): NotificationDeepLink | null {
  const candidate = {
    siteId: typeof values.siteId === 'string' ? values.siteId : undefined,
    threadId: typeof values.threadId === 'string' ? values.threadId : undefined,
    visitorId: typeof values.visitorId === 'string' ? values.visitorId : undefined,
  };
  if (Object.values(candidate).every((value) => value === undefined)) return null;
  const parsed = NotificationDeepLinkSchema.safeParse(candidate);
  if (!parsed.success) throw new ValidationError('Invalid notification destination.');
  return parsed.data;
}

export function notificationDeepLinkFromSearchParams(
  searchParams: URLSearchParams,
): NotificationDeepLink | null {
  return notificationDeepLinkFromValues({
    siteId: searchParams.get('siteId') ?? undefined,
    threadId: searchParams.get('threadId') ?? undefined,
    visitorId: searchParams.get('visitorId') ?? undefined,
  });
}

export function appendNotificationDeepLink(url: URL, target: NotificationDeepLink | null): URL {
  if (!target) return url;
  url.searchParams.set('siteId', target.siteId);
  url.searchParams.set('visitorId', target.visitorId);
  url.searchParams.set('threadId', target.threadId);
  return url;
}

export function notificationDeepLinkPath(target: NotificationDeepLink | null): string {
  if (!target) return '/dashboard';
  const query = new URLSearchParams({ siteId: target.siteId, threadId: target.threadId });
  return `/dashboard/visitors/${encodeURIComponent(target.visitorId)}?${query.toString()}`;
}
