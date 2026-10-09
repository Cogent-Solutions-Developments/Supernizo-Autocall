import 'server-only';
import type { VisitorPresenceSnapshot } from '@supernizo/shared';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';

export function createLivePresenceService(
  dependencies: Pick<
    RuntimeProviders,
    'getEnvironmentReadiness' | 'getRealtimeProvider' | 'getPresenceRepository'
  > & {},
) {
  const { getEnvironmentReadiness, getRealtimeProvider, getPresenceRepository } = dependencies;
  async function publishVisitorPresence(snapshot: VisitorPresenceSnapshot): Promise<void> {
    const writeResult = await getPresenceRepository().upsert(snapshot);

    if (!getEnvironmentReadiness().realtime) {
      return;
    }

    const event = writeResult.wasOnline
      ? { type: 'visitor.updated' as const, visitor: snapshot }
      : { type: 'visitor.online' as const, visitor: snapshot };
    await getRealtimeProvider().emitToChannel(`site:${snapshot.siteId}`, event);
  }

  async function listLiveVisitorsForSite(siteId: string): Promise<VisitorPresenceSnapshot[]> {
    return getPresenceRepository().listBySite(siteId);
  }

  async function getLiveVisitor(
    siteId: string,
    visitorId: string,
  ): Promise<VisitorPresenceSnapshot | null> {
    return getPresenceRepository().get(siteId, visitorId);
  }
  return { publishVisitorPresence, listLiveVisitorsForSite, getLiveVisitor };
}
