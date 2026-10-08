import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@generated/prisma/client';
import { createDatabaseClient } from '../db/client';
import { createChatContactRepository } from './chat-contact-repository';
import { createChatRepository } from './chat-repository';
import type { ContactScope } from '@/server/application/ports/chat-contact-repository';
const localTestDatabase =
  process.env.DATABASE_URL?.includes('/autocall_test') || process.env.CI === 'true';
describe.skipIf(!localTestDatabase)('durable chat follow-up', () => {
  let database: PrismaClient;
  let siteId: string;
  let scope: ContactScope;
  beforeAll(async () => {
    database = createDatabaseClient();
    const site = await database.site.create({
      data: {
        name: 'Contact test',
        publicKey: 'site_contact_' + randomUUID(),
        allowedOrigins: ['http://localhost:3100'],
      },
    });
    siteId = site.id;
    const visitor = await database.visitor.create({ data: { siteId, anonymousId: randomUUID() } });
    const session = await database.session.create({
      data: { siteId, visitorId: visitor.id, anonymousSessionId: randomUUID() },
    });
    scope = { siteId, visitorId: visitor.id, sessionId: session.id };
  });
  afterAll(async () => {
    if (database) {
      if (siteId) await database.site.delete({ where: { id: siteId } });
      await database.$disconnect();
    }
  });
  it('keeps contact capture and a simultaneous first message on one thread', async () => {
    const contacts = createChatContactRepository(() => database);
    const chats = createChatRepository(() => database);
    const consent = {
      contactChannel: 'BOTH' as const,
      contactEmail: 'followup@example.com',
      contactWhatsApp: '+94771234567',
      contactConsentAt: new Date(),
      contactConsentVersion: 'conversation-follow-up-v1',
    };
    const [id, messageThread] = await Promise.all([
      contacts.saveContact(scope, undefined, consent),
      chats.transaction(async (tx) => {
        const thread =
          (await tx.findThreadForStart(scope)) ?? (await tx.createVisitorThread(scope));
        const message = await tx.createOpeningMessage('Please reply later', thread);
        await tx.touchOpeningThread(thread, message);
        return thread.id;
      }),
    ]);
    expect(id).toBe(messageThread);
    expect(await database.chatThread.count({ where: { siteId } })).toBe(1);
    expect(await contacts.getThread(id)).toMatchObject(consent);
    await contacts.setStatus(id, 'RESOLVED');
    expect((await contacts.getThread(id))?.followUpStatus).toBe('RESOLVED');
    await chats.transaction(async (tx) => {
      const message = await tx.createVisitorMessage('One more question', id);
      await tx.touchThread(id, message);
    });
    expect((await contacts.getThread(id))?.followUpStatus).toBe('NEEDS_REPLY');
    await contacts.saveContact(scope, id, {
      ...consent,
      contactChannel: 'EMAIL',
      contactWhatsApp: null,
    });
    expect((await contacts.getThread(id))?.contactWhatsApp).toBeNull();
    expect(await contacts.hasSavedContact(scope)).toBe(true);
    const inbox = await chats.listInbox(siteId, 10);
    expect(inbox[0]?.contactConsentAt).not.toBeNull();
    expect(inbox[0]).not.toHaveProperty('contactEmail');
  });
});
