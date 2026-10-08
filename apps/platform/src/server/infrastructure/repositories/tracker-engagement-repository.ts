import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  TrackerEngagementRepository,
  TrackerEngagementRepositorySession,
} from '@/server/application/ports/tracker-engagement-repository';

function bindRepository(
  getClient: () => Prisma.TransactionClient,
): TrackerEngagementRepositorySession {
  return {
    async getPresenceSession(context) {
      const database = getClient();
      return database.session.findUniqueOrThrow({
        where: { id: context.sessionId },
        include: {
          visitor: {
            include: { _count: { select: { sessions: true } } },
          },
        },
      });
    },
    async findTrackingSession(context) {
      const database = getClient();
      return database.session.findFirst({
        where: {
          anonymousSessionId: context.sessionId,
          site: { publicKey: context.sitePublicKey },
          visitor: { anonymousId: context.visitorId },
        },
        select: {
          id: true,
          site: {
            select: {
              allowedOrigins: true,
              id: true,
              status: true,
              trackingEnabled: true,
            },
          },
          siteId: true,
          visitor: { select: { id: true, siteId: true } },
          visitorId: true,
        },
      });
    },
    async findPageView(pageViewId) {
      const database = getClient();
      return database.pageView.findUnique({
        where: { anonymousPageViewId: pageViewId },
      });
    },
    async findPageForRecord(input) {
      const database = getClient();
      return database.pageView.findUnique({
        where: { anonymousPageViewId: input.payload.pageViewId },
      });
    },
    async touchSession(input, now, context) {
      const database = getClient();
      return database.session.update({
        data: { currentUrl: input.payload.url, lastSeenAt: now },
        where: { id: context.sessionId },
      });
    },
    async touchVisitor(now, context) {
      const database = getClient();
      return database.visitor.update({
        data: { lastSeenAt: now },
        where: { id: context.visitorId },
      });
    },
    async openPageView(input, now, context) {
      const database = getClient();
      return database.pageView.upsert({
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
      });
    },
    async incrementSessionActivity(payload, now, context) {
      const database = getClient();
      return database.session.update({
        data: {
          activeDurationSeconds: { increment: payload.activeSecondsDelta },
          lastSeenAt: now,
        },
        where: { id: context.sessionId },
      });
    },
    async touchActiveVisitor(now, context) {
      const database = getClient();
      return database.visitor.update({
        data: { lastSeenAt: now },
        where: { id: context.visitorId },
      });
    },
    async updatePageMetrics(payload, leave, now, pageViewId) {
      const database = getClient();
      return database.pageView.update({
        data: {
          activeDurationSeconds: { increment: payload.activeSecondsDelta },
          maxScrollPercent: { set: payload.maxScrollPercent },
          ...(leave ? { leftAt: now } : {}),
        },
        where: { id: pageViewId },
      });
    },
    async touchEventSession(context) {
      const database = getClient();
      return database.session.update({
        data: { lastSeenAt: new Date() },
        where: { id: context.sessionId },
      });
    },
    async createEvent(input, context) {
      const database = getClient();
      return database.visitorEvent.create({
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
      });
    },
  };
}

export function createTrackerEngagementRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): TrackerEngagementRepository {
  return { ...bindRepository(getClient) };
}
