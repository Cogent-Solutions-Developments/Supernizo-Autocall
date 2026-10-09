import type { TrackerEngagementRepository } from '@/server/application/ports/tracker-engagement-repository';
import 'server-only';
import type {
  TrackerEventRequest,
  TrackerHeartbeatRequest,
  TrackerPageLeaveRequest,
  TrackerPageRequest,
  TrackingContext,
} from '@supernizo/shared';
import { ConflictError, NotFoundError } from '@/server/domain/errors/app-error';
import type { createLivePresenceService } from '@/server/application/presence/live-presence-service';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import type { createTrackerBootstrapService } from './tracker-bootstrap-service';
export type ResolvedTrackingContext = Readonly<{
  sessionId: string;
  siteId: string;
  visitorId: string;
}>;

type Delay = (milliseconds: number) => Promise<void>;

type RelationshipCheck = Readonly<{
  sessionSiteId: string;
  sessionVisitorId: string;
  siteId: string;
  visitorId: string;
  visitorSiteId: string;
}>;
export function createTrackerEngagementService(
  dependencies: Pick<RuntimeProviders, 'isRetryableWriteError'> & {
    publishVisitorPresence: ReturnType<typeof createLivePresenceService>['publishVisitorPresence'];
    repository: TrackerEngagementRepository;
    assertTrackingSiteAccess: ReturnType<
      typeof createTrackerBootstrapService
    >['assertTrackingSiteAccess'];
  },
) {
  const { repository, assertTrackingSiteAccess, publishVisitorPresence, isRetryableWriteError } =
    dependencies;
  const TRACKING_WRITE_RETRY_DELAYS_MS = [25, 75] as const;

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function isRetryableTrackingWriteError(error: unknown): boolean {
    return isRetryableWriteError(error);
  }

  async function retryTrackingWrite<T>(
    operation: () => Promise<T>,
    wait: Delay = delay,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        const retryDelay = TRACKING_WRITE_RETRY_DELAYS_MS[attempt];
        if (retryDelay === undefined || !isRetryableTrackingWriteError(error)) {
          throw error;
        }

        await wait(retryDelay);
      }
    }
  }

  async function publishCurrentPresence(context: ResolvedTrackingContext): Promise<void> {
    const session = await repository.getPresenceSession(context);

    await publishVisitorPresence({
      activeDurationSeconds: session.activeDurationSeconds,
      anonymousVisitorId: session.visitor.anonymousId,
      browserName: session.browserName,
      city: session.geoCity,
      country: session.geoCountry,
      currentUrl: session.currentUrl,
      deviceType: session.deviceType,
      intentScore: null,
      lastSeenAt: session.lastSeenAt.toISOString(),
      returningVisitCount: session.visitor._count.sessions,
      sessionId: session.anonymousSessionId,
      siteId: context.siteId,
      source: session.utmSource,
      visitorId: context.visitorId,
    });
  }

  function assertTrackingContextRelationships(relationships: RelationshipCheck): void {
    if (
      relationships.visitorSiteId !== relationships.siteId ||
      relationships.sessionSiteId !== relationships.siteId ||
      relationships.sessionVisitorId !== relationships.visitorId
    ) {
      throw new ConflictError('The tracking visitor and session context is invalid.');
    }
  }

  async function resolveTrackingContext(
    context: TrackingContext,
    origin: string,
  ): Promise<ResolvedTrackingContext> {
    const session = await repository.findTrackingSession(context);
    if (!session) {
      throw new NotFoundError('The tracking visitor or session was not found.');
    }
    assertTrackingSiteAccess(session.site, origin);

    assertTrackingContextRelationships({
      sessionSiteId: session.siteId,
      sessionVisitorId: session.visitorId,
      siteId: session.site.id,
      visitorId: session.visitor.id,
      visitorSiteId: session.visitor.siteId,
    });

    return { sessionId: session.id, siteId: session.site.id, visitorId: session.visitor.id };
  }

  async function requirePageView(pageViewId: string, sessionId: string): Promise<string> {
    const pageView = await repository.findPageView(pageViewId);

    if (!pageView || pageView.sessionId !== sessionId) {
      throw new ConflictError('The tracking page view does not belong to this session.');
    }

    return pageView.id;
  }

  async function recordTrackerPage(input: {
    origin: string;
    payload: TrackerPageRequest;
  }): Promise<void> {
    const context = await resolveTrackingContext(input.payload, input.origin);
    const now = new Date();
    const existingPageView = await repository.findPageForRecord(input);
    if (existingPageView && existingPageView.sessionId !== context.sessionId) {
      throw new ConflictError('The tracking page view does not belong to this session.');
    }

    await retryTrackingWrite(() => repository.touchSession(input, now, context));
    await retryTrackingWrite(() => repository.touchVisitor(now, context));
    await retryTrackingWrite(() => repository.openPageView(input, now, context));
    await publishCurrentPresence(context);
  }

  async function applyPageMetrics(
    payload: TrackerHeartbeatRequest | TrackerPageLeaveRequest,
    origin: string,
    leave: boolean,
  ): Promise<ResolvedTrackingContext> {
    const context = await resolveTrackingContext(payload, origin);
    const pageViewId = await requirePageView(payload.pageViewId, context.sessionId);
    const now = new Date();

    await retryTrackingWrite(() => repository.incrementSessionActivity(payload, now, context));
    await retryTrackingWrite(() => repository.touchActiveVisitor(now, context));
    await retryTrackingWrite(() => repository.updatePageMetrics(payload, leave, now, pageViewId));

    return context;
  }

  async function recordTrackerHeartbeat(input: {
    origin: string;
    payload: TrackerHeartbeatRequest;
  }): Promise<void> {
    const context = await applyPageMetrics(input.payload, input.origin, false);
    await publishCurrentPresence(context);
  }

  async function recordTrackerPageLeave(input: {
    origin: string;
    payload: TrackerPageLeaveRequest;
  }): Promise<void> {
    await applyPageMetrics(input.payload, input.origin, true);
  }

  async function recordTrackerEvent(input: {
    origin: string;
    payload: TrackerEventRequest;
  }): Promise<void> {
    const context = await resolveTrackingContext(input.payload, input.origin);
    if (input.payload.pageViewId) {
      await requirePageView(input.payload.pageViewId, context.sessionId);
    }

    await retryTrackingWrite(() => repository.touchEventSession(context));
    await retryTrackingWrite(() => repository.createEvent(input, context));
  }
  return {
    isRetryableTrackingWriteError,
    retryTrackingWrite,
    assertTrackingContextRelationships,
    resolveTrackingContext,
    recordTrackerPage,
    recordTrackerHeartbeat,
    recordTrackerPageLeave,
    recordTrackerEvent,
  };
}
