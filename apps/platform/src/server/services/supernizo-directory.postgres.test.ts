import { randomUUID } from 'node:crypto';
import { ManagedUserCreateSchema } from '@supernizo/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/db/client';
import { DirectoryEventSchema } from '@/server/integrations/supernizo-contract';
import { synchronizeDirectoryEvent, applyDirectoryState } from './supernizo-directory-service';
import { updateManagedUser } from './access-management-service';
import { fetchDirectoryUser } from '@/server/integrations/supernizo-directory-client';

vi.mock('@/server/db/client', () => ({ getDatabaseClient: vi.fn() }));
vi.mock('@/server/integrations/supernizo-directory-client', () => ({
  fetchDirectoryUser: vi.fn(),
}));

const url = process.env.BRIDGE_TEST_DATABASE_URL;
const subjects: string[] = [];
function event(revision = '1', eligibility = 'ELIGIBLE', subject: string = randomUUID()) {
  subjects.push(subject);
  return DirectoryEventSchema.parse({
    eventId: randomUUID(),
    schemaVersion: 1,
    subject,
    directoryRevision: revision,
    changedAt: '2026-09-08T00:00:00.000Z',
    user: { displayName: 'Bridge test agent', role: 'AGENT', eligibility },
  });
}

describe.skipIf(!url)('Supernizo directory PostgreSQL integration', () => {
  let db: PrismaClient;
  beforeAll(() => {
    if (!url || new URL(url).pathname !== '/bridge_test')
      throw new Error('Use only the disposable bridge_test database.');
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    vi.mocked(getDatabaseClient).mockReturnValue(db);
    vi.stubEnv('SUPERNIZO_DIRECTORY_SYNC_ENABLED', 'true');
  });
  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({
      where: { supernizoId: { in: subjects } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await db.siteMember.deleteMany({ where: { userId: { in: ids } } });
    await db.supernizoUserState.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.integrationInbox.deleteMany({ where: { subject: { in: subjects } } });
    await db.$disconnect();
    vi.unstubAllEnvs();
  });
  it('deduplicates concurrent deliveries and rejects reused IDs', async () => {
    const value = event();
    const results = await Promise.all([
      synchronizeDirectoryEvent(value),
      synchronizeDirectoryEvent(value),
    ]);
    expect(results.sort()).toEqual(['applied', 'duplicate']);
    expect(await db.user.count({ where: { supernizoId: value.subject } })).toBe(1);
    await expect(synchronizeDirectoryEvent({ ...value, subject: randomUUID() })).rejects.toThrow(
      'reused',
    );
  });
  it('ignores an old grant after revocation and preserves memberships across re-grant', async () => {
    const value = event();
    await synchronizeDirectoryEvent(value);
    const user = await db.user.findUniqueOrThrow({ where: { supernizoId: value.subject } });
    const site = await db.site.create({
      data: { name: 'Bridge test', publicKey: `site_${randomUUID()}`, allowedOrigins: [] },
    });
    try {
      await db.siteMember.create({ data: { siteId: site.id, userId: user.id } });
      await synchronizeDirectoryEvent(event('3', 'REVOKED', value.subject));
      await synchronizeDirectoryEvent(event('2', 'ELIGIBLE', value.subject));
      expect(
        (await db.supernizoUserState.findUniqueOrThrow({ where: { userId: user.id } })).eligibility,
      ).toBe('REVOKED');
      await synchronizeDirectoryEvent(event('4', 'ELIGIBLE', value.subject));
      expect((await db.user.findUniqueOrThrow({ where: { supernizoId: value.subject } })).id).toBe(
        user.id,
      );
      expect(await db.siteMember.count({ where: { userId: user.id, siteId: site.id } })).toBe(1);
    } finally {
      await db.site.delete({ where: { id: site.id } });
    }
  });
  it('serializes SSO provisioning against delivery', async () => {
    const old = event();
    await Promise.all([
      db.$transaction((tx) => applyDirectoryState(tx, old)),
      synchronizeDirectoryEvent(event('2', 'DISABLED', old.subject)),
    ]);
    const user = await db.user.findUniqueOrThrow({
      where: { supernizoId: old.subject },
      include: { supernizoState: true },
    });
    expect(user.supernizoState?.eligibility).toBe('DISABLED');
  });
  it('repairs profile drift on reconciliation and rejects contradictory equal revisions', async () => {
    const value = event();
    await synchronizeDirectoryEvent(value);
    await db.user.update({
      where: { supernizoId: value.subject },
      data: { displayName: 'Unintended edit' },
    });
    await synchronizeDirectoryEvent({ ...value, eventId: randomUUID() });
    expect(
      (await db.user.findUniqueOrThrow({ where: { supernizoId: value.subject } })).displayName,
    ).toBe(value.user.displayName);
    await expect(
      synchronizeDirectoryEvent({
        ...value,
        eventId: randomUUID(),
        user: { ...value.user, role: 'ADMIN' },
      }),
    ).rejects.toThrow('Conflicting');
  });
  it('keeps tombstones and rejects local agent creation', async () => {
    const value = event('2', 'DELETED');
    await synchronizeDirectoryEvent(value);
    expect(await db.user.count({ where: { supernizoId: value.subject } })).toBe(1);
    expect(
      ManagedUserCreateSchema.safeParse({
        displayName: 'Local agent',
        email: 'a@example.com',
        password: 'not-created-password',
        role: 'AGENT',
        siteIds: [],
      }).success,
    ).toBe(false);
  });
  it('does not merge a reserved-email collision into a local account', async () => {
    const value = event();
    const local = await db.user.create({
      data: { email: `${value.subject}@supernizo.invalid`, globalRole: 'ADMIN' },
    });
    try {
      await expect(synchronizeDirectoryEvent(value)).rejects.toThrow('conflicts');
      expect((await db.user.findUniqueOrThrow({ where: { id: local.id } })).supernizoId).toBeNull();
      expect(await db.integrationInbox.count({ where: { eventId: value.eventId } })).toBe(0);
    } finally {
      await db.user.delete({ where: { id: local.id } });
    }
  });
  it('revalidates assignment, rejects managed field edits and preserves existing membership', async () => {
    const value = event();
    await synchronizeDirectoryEvent(value);
    const user = await db.user.findUniqueOrThrow({ where: { supernizoId: value.subject } });
    const actor = await db.user.create({
      data: { email: `${randomUUID()}@test.invalid`, globalRole: 'ADMIN' },
    });
    const site = await db.site.create({
      data: { name: 'Assignment test', publicKey: `site_${randomUUID()}`, allowedOrigins: [] },
    });
    try {
      vi.mocked(fetchDirectoryUser).mockResolvedValue(value);
      await updateManagedUser(actor.id, user.id, {
        displayName: value.user.displayName,
        role: 'AGENT',
        siteIds: [site.id],
      });
      await expect(
        updateManagedUser(actor.id, user.id, {
          displayName: 'Override',
          role: 'ADMIN',
          siteIds: [],
        }),
      ).rejects.toThrow('managed in Supernizo');
      vi.mocked(fetchDirectoryUser).mockResolvedValue(event('2', 'REVOKED', value.subject));
      await expect(
        updateManagedUser(actor.id, user.id, {
          displayName: value.user.displayName,
          role: 'AGENT',
          siteIds: [],
        }),
      ).rejects.toThrow('no longer');
      expect(await db.siteMember.count({ where: { userId: user.id, siteId: site.id } })).toBe(1);
    } finally {
      await db.site.delete({ where: { id: site.id } });
      await db.user.delete({ where: { id: actor.id } });
    }
  });
});
