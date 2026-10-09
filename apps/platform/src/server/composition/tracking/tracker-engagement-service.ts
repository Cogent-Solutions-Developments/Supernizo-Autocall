import { runtimeProviders } from '@/server/composition/runtime-providers';
import { publishVisitorPresence } from '@/server/composition/presence/live-presence-service';
import 'server-only';
import { createTrackerEngagementService } from '@/server/application/tracking/tracker-engagement-service';
import { createTrackerEngagementRepository } from '@/server/infrastructure/repositories/tracker-engagement-repository';
import { assertTrackingSiteAccess } from '@/server/composition/tracking/tracker-bootstrap-service';
export * from '@/server/application/tracking/tracker-engagement-service';
const service = createTrackerEngagementService({
  ...runtimeProviders,
  publishVisitorPresence,
  repository: createTrackerEngagementRepository(),
  assertTrackingSiteAccess: (...args) => assertTrackingSiteAccess(...args),
});
export const {
  isRetryableTrackingWriteError,
  retryTrackingWrite,
  assertTrackingContextRelationships,
  resolveTrackingContext,
  recordTrackerPage,
  recordTrackerHeartbeat,
  recordTrackerPageLeave,
  recordTrackerEvent,
} = service;
