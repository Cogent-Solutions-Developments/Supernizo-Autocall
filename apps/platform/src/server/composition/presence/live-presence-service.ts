import 'server-only';
import { createLivePresenceService } from '@/server/application/presence/live-presence-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
export * from '@/server/application/presence/live-presence-service';
const service = createLivePresenceService({ ...runtimeProviders });
export const { publishVisitorPresence, listLiveVisitorsForSite, getLiveVisitor } = service;
