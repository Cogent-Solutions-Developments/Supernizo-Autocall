import 'server-only';

import type {
  TrackerEventRequest,
  TrackerHeartbeatRequest,
  TrackerPageLeaveRequest,
  TrackerPageRequest,
  TrackingContext,
} from '@supernizo/shared';

import { ConflictError, NotFoundError } from '@/server/errors/app-error';
import { getDatabaseClient } from '@/server/db/client';
import { publishVisitorPresence } from '@/server/services/live-presence-service';

import { assertTrackingSiteAccess } from './tracker-bootstrap-service';

export type ResolvedTrackingContext = Readonly<{
  sessionId: string;
  siteId: string;
  visitorId: string;
}>;

const TRACKING_WRITE_RETRY_DELAYS_MS = [25, 75] as const;

type Delay = (milliseconds: number) => Promise<void>;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isRetryableTrackingWriteError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: unknown }).code === 'P2034'
  );
}

export async function retryTrackingWrite<T>(
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
  const session = await getDatabaseClient().session.findUniqueOrThrow({
    where: { id: context.sessionId },
    include: {
      visitor: {
        include: { _count: { select: { sessions: true } } },
      },
    },
  });

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

type RelationshipCheck = Readonly<{
  sessionSiteId: string;
  sessionVisitorId: string;
  siteId: string;
  visitorId: string;
  visitorSiteId: string;
}>;

export function assertTrackingContextRelationships(relationships: RelationshipCheck): void {
  if (
    relationships.visitorSiteId !== relationships.siteId ||
    relationships.sessionSiteId !== relationships.siteId ||
    relationships.sessionVisitorId !== relationships.visitorId
  ) {
    throw new ConflictError('The tracking visitor and session context is invalid.');
  }
}

export async function resolveTrackingContext(
  context: TrackingContext,
  origin: string,
): Promise<ResolvedTrackingContext> {
  const database = getDatabaseClient();
  const site = await database.site.findUnique({
    where: { publicKey: context.sitePublicKey },
  });
  assertTrackingSiteAccess(site, origin);
  if (!site) {
    throw new NotFoundError('The tracking site was not found.');
  }

  const visitor = await database.visitor.findUnique({
    where: {
      siteId_anonymousId: {
        anonymousId: context.visitorId,
        siteId: site.id,
      },
    },
  });
  const session = await database.session.findUnique({
    where: { anonymousSessionId: context.sessionId },
  });

  if (!visitor || !session) {
    throw new NotFoundError('The tracking visitor or session was not found.');
  }

  assertTrackingContextRelationships({
    sessionSiteId: session.siteId,
    sessionVisitorId: session.visitorId,
    siteId: site.id,
    visitorId: visitor.id,
    visitorSiteId: visitor.siteId,
  });

  return { sessionId: session.id, siteId: site.id, visitorId: visitor.id };
}

async function requirePageView(pageViewId: string, sessionId: string): Promise<string> {
  const pageView = await getDatabaseClient().pageView.findUnique({
    where: { anonymousPageViewId: pageViewId },
  });

  if (!pageView || pageView.sessionId !== sessionId) {
    throw new ConflictError('The tracking page view does not belong to this session.');
  }

  return pageView.id;
}

export async function recordTrackerPage(input: {
  origin: string;
  payload: TrackerPageRequest;
}): Promise<void> {
  const context = await resolveTrackingContext(input.payload, input.origin);
  const database = getDatabaseClient();
  const now = new Date();
  const existingPageView = await database.pageView.findUnique({
    where: { anonymousPageViewId: input.payload.pageViewId },
  });
  if (existingPageView && existingPageView.sessionId !== context.sessionId) {
    throw new ConflictError('The tracking page view does not belong to this session.');
  }

  await retryTrackingWrite(() =>
    database.session.update({
      data: { currentUrl: input.payload.url, lastSeenAt: now },
      where: { id: context.sessionId },
    }),
  );
  await retryTrackingWrite(() =>
    database.visitor.update({
      data: { lastSeenAt: now },
      where: { id: context.visitorId },
    }),
  );
  await retryTrackingWrite(() =>
    database.pageView.upsert({
      create: {
        anonymousPageViewId: input.payload.pageViewId,
        enteredAt: now,
        path: input.payload.path,
        sessionId: context.sessionId,
        title: input.payload.title,
        url: input.payload.url,
      },
      update: {},
      where: { anonymousPageViewId: input.payload.pageViewId },
    }),
  );
  await publishCurrentPresence(context);
}

async function applyPageMetrics(
  payload: TrackerHeartbeatRequest | TrackerPageLeaveRequest,
  origin: string,
  leave: boolean,
): Promise<ResolvedTrackingContext> {
  const context = await resolveTrackingContext(payload, origin);
  const pageViewId = await requirePageView(payload.pageViewId, context.sessionId);
  const database = getDatabaseClient();
  const now = new Date();

  await retryTrackingWrite(() =>
    database.session.update({
      data: {
        activeDurationSeconds: { increment: payload.activeSecondsDelta },
        lastSeenAt: now,
      },
      where: { id: context.sessionId },
    }),
  );
  await retryTrackingWrite(() =>
    database.visitor.update({
      data: { lastSeenAt: now },
      where: { id: context.visitorId },
    }),
  );
  await retryTrackingWrite(() =>
    database.pageView.update({
      data: {
        activeDurationSeconds: { increment: payload.activeSecondsDelta },
        maxScrollPercent: { set: payload.maxScrollPercent },
        ...(leave ? { leftAt: now } : {}),
      },
      where: { id: pageViewId },
    }),
  );

  return context;
}

export async function recordTrackerHeartbeat(input: {
  origin: string;
  payload: TrackerHeartbeatRequest;
}): Promise<void> {
  const context = await applyPageMetrics(input.payload, input.origin, false);
  await publishCurrentPresence(context);
}

export async function recordTrackerPageLeave(input: {
  origin: string;
  payload: TrackerPageLeaveRequest;
}): Promise<void> {
  await applyPageMetrics(input.payload, input.origin, true);
}

export async function recordTrackerEvent(input: {
  origin: string;
  payload: TrackerEventRequest;
}): Promise<void> {
  const context = await resolveTrackingContext(input.payload, input.origin);
  const database = getDatabaseClient();

  if (input.payload.pageViewId) {
    await requirePageView(input.payload.pageViewId, context.sessionId);
  }

  await retryTrackingWrite(() =>
    database.session.update({
      data: { lastSeenAt: new Date() },
      where: { id: context.sessionId },
    }),
  );
  await retryTrackingWrite(() =>
    database.visitorEvent.create({
      data: {
        name: input.payload.name,
        payload: input.payload.pageViewId
          ? { ...input.payload.metadata, pageViewId: input.payload.pageViewId }
          : input.payload.metadata,
        sessionId: context.sessionId,
        siteId: context.siteId,
        type: input.payload.type,
        visitorId: context.visitorId,
      },
    }),
  );
}
