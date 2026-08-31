import type { PageView, PrismaClient, Session } from '@generated/prisma/client';

export type CreateVisitorInput = Readonly<{
  siteId: string;
  anonymousId: string;
  lastSeenAt: Date;
}>;

export type CreateSessionInput = Readonly<{
  siteId: string;
  visitorId: string;
  anonymousSessionId: string;
  startedAt: Date;
  lastSeenAt: Date;
}>;

export type CreatePageViewInput = Readonly<{
  sessionId: string;
  path: string;
  url: string;
  enteredAt: Date;
}>;

export type VisitorSessionRepository = Readonly<{
  createVisitor: (input: CreateVisitorInput) => ReturnType<PrismaClient['visitor']['create']>;
  createSession: (input: CreateSessionInput) => ReturnType<PrismaClient['session']['create']>;
  createPageView: (input: CreatePageViewInput) => ReturnType<PrismaClient['pageView']['create']>;
  findSessionTimeline: (sessionId: string) => Promise<
    Session & {
      pageViews: PageView[];
    }
  >;
}>;

export function createVisitorSessionRepository(client: PrismaClient): VisitorSessionRepository {
  return {
    createVisitor: (input) =>
      client.visitor.create({
        data: input,
      }),
    createSession: (input) =>
      client.session.create({
        data: input,
      }),
    createPageView: (input) =>
      client.pageView.create({
        data: input,
      }),
    findSessionTimeline: (sessionId) =>
      client.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: {
          pageViews: {
            orderBy: { enteredAt: 'asc' },
          },
        },
      }),
  };
}
