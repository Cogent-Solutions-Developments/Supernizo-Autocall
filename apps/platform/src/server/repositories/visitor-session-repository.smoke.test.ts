import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@generated/prisma/client';
import type { VisitorSessionRepository } from './visitor-session-repository';

config({ path: '.env.local', quiet: true });

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('VisitorSessionRepository smoke test', () => {
  let database: PrismaClient;
  let repository: VisitorSessionRepository;
  let siteId: string;

  beforeAll(async () => {
    const [{ createDatabaseClient }, { createVisitorSessionRepository }] = await Promise.all([
      import('../db/client'),
      import('./visitor-session-repository'),
    ]);

    database = createDatabaseClient();
    repository = createVisitorSessionRepository(database);
    const suffix = randomUUID();
    const site = await database.site.create({
      data: {
        allowedOrigins: ['http://localhost:3100'],
        name: `Repository smoke ${suffix}`,
        publicKey: `site_smoke_${suffix}`,
      },
    });

    siteId = site.id;
  });

  afterAll(async () => {
    if (database && siteId) {
      await database.site.delete({ where: { id: siteId } });
      await database.$disconnect();
    }
  });

  it('inserts and reads Visitor → Session → PageView', async () => {
    const occurredAt = new Date();
    const visitor = await repository.createVisitor({
      anonymousId: `visitor_${randomUUID()}`,
      lastSeenAt: occurredAt,
      siteId,
    });
    const session = await repository.createSession({
      anonymousSessionId: `session_${randomUUID()}`,
      lastSeenAt: occurredAt,
      siteId,
      startedAt: occurredAt,
      visitorId: visitor.id,
    });

    await repository.createPageView({
      anonymousPageViewId: randomUUID(),
      enteredAt: occurredAt,
      path: '/pricing',
      sessionId: session.id,
      url: 'http://localhost:3100/pricing',
    });

    const timeline = await repository.findSessionTimeline(session.id);

    expect(timeline.visitorId).toBe(visitor.id);
    expect(timeline.pageViews).toHaveLength(1);
    expect(timeline.pageViews[0]).toMatchObject({ path: '/pricing' });
  });
});
