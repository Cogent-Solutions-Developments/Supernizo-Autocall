import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pageViews: vi.fn(), events: vi.fn(), groupVisitors: vi.fn() }));
vi.mock('@/server/infrastructure/db/client', () => ({
  getDatabaseClient: () => ({
    pageView: { findMany: mocks.pageViews },
    visitorEvent: { findMany: mocks.events },
    session: { groupBy: mocks.groupVisitors },
  }),
}));
import { createVisitorInsightsRepository } from './visitor-insights-repository';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pageViews.mockResolvedValue([]);
  mocks.events.mockResolvedValue([]);
  mocks.groupVisitors.mockResolvedValue([]);
});
it('keeps timeline cursor ties and site/visitor scope consistent across row kinds', async () => {
  const repository = createVisitorInsightsRepository();
  const occurredAt = '2026-09-07T14:00:00.000Z';
  const cursor = { id: 'cursor-1', kind: 'event' as const, occurredAt };
  await repository.listPageViews('site-1', 'visitor-1', cursor, 25);
  await repository.listEvents('site-1', 'visitor-1', cursor, 25);
  expect(mocks.pageViews).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: [
          { session: { is: { siteId: 'site-1', visitorId: 'visitor-1' } } },
          {
            OR: [
              { enteredAt: { lt: new Date(occurredAt) } },
              { enteredAt: { equals: new Date(occurredAt) } },
            ],
          },
        ],
      },
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
      take: 26,
    }),
  );
  expect(mocks.events).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: [
          { siteId: 'site-1', visitorId: 'visitor-1' },
          {
            OR: [
              { createdAt: { lt: new Date(occurredAt) } },
              {
                AND: [{ createdAt: { equals: new Date(occurredAt) } }, { id: { lt: 'cursor-1' } }],
              },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 26,
    }),
  );
});
it('keeps analytics bounded to the selected site and exclusive UTC end', async () => {
  const period = {
    from: new Date('2026-09-01T00:00:00Z'),
    toExclusive: new Date('2026-09-08T00:00:00Z'),
  };
  await createVisitorInsightsRepository().groupVisitors(period, 'site-1');
  expect(mocks.groupVisitors).toHaveBeenCalledWith({
    by: ['visitorId'],
    where: { lastSeenAt: { gte: period.from, lt: period.toExclusive }, siteId: 'site-1' },
  });
});
