import 'server-only';

import type { VisitorPresenceSnapshot } from '@supernizo/shared';

import { getEnvironmentReadiness } from '@/server/env';
import { UpstashRealtimeProvider } from '@/server/realtime';
import { getPresenceRepository } from '@/server/presence/presence-repository';

export async function publishVisitorPresence(snapshot: VisitorPresenceSnapshot): Promise<void> {
  const writeResult = await getPresenceRepository().upsert(snapshot);

  if (!getEnvironmentReadiness().realtime) {
    return;
  }

  const event = writeResult.wasOnline
    ? { type: 'visitor.updated' as const, visitor: snapshot }
    : { type: 'visitor.online' as const, visitor: snapshot };
  await new UpstashRealtimeProvider().emitToChannel(`site:${snapshot.siteId}`, event);
}

export async function listLiveVisitorsForSite(siteId: string): Promise<VisitorPresenceSnapshot[]> {
  return getPresenceRepository().listBySite(siteId);
}

export async function getLiveVisitor(
  siteId: string,
  visitorId: string,
): Promise<VisitorPresenceSnapshot | null> {
  return getPresenceRepository().get(siteId, visitorId);
}
