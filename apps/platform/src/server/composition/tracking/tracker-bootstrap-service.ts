import 'server-only';
import { createTrackerBootstrapService } from '@/server/application/tracking/tracker-bootstrap-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createTrackerBootstrapRepository } from '@/server/infrastructure/repositories/tracker-bootstrap-repository';
export * from '@/server/application/tracking/tracker-bootstrap-service';
const service = createTrackerBootstrapService({
  ...runtimeProviders,
  repository: createTrackerBootstrapRepository(),
});
export const { assertTrackingSiteAccess, readApproximateGeo, bootstrapTracker } = service;
