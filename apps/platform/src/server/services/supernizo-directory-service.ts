import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/db/client';
import { ConflictError } from '@/server/errors/app-error';
import type { DirectoryEvent, DirectoryState } from '@/server/integrations/supernizo-contract';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function lockDirectoryUser(
  transaction: Prisma.TransactionClient,
  subject: string,
): Promise<void> {
  // Shared by SSO and directory event delivery. Works across replicas.
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`supernizo:${subject}`}, 0))::text`;
}

export async function applyDirectoryState(
  transaction: Prisma.TransactionClient,
  state: DirectoryState,
) {
  await lockDirectoryUser(transaction, state.subject);
  const existing = await transaction.user.findUnique({
    where: { supernizoId: state.subject },
    include: { supernizoState: true },
  });
  if (
    !existing &&
    (await transaction.user.findUnique({
      where: { email: `${state.subject}@supernizo.invalid` },
      select: { id: true },
    }))
  ) {
    throw new ConflictError('The Supernizo identity conflicts with an existing local account.');
  }
  const revision = BigInt(state.directoryRevision);
  const stateHash = digest({ changedAt: state.changedAt, user: state.user });
  if (existing?.supernizoState && existing.supernizoState.directoryRevision > revision)
    return existing;
  if (
    existing?.supernizoState?.directoryRevision === revision &&
    existing.supernizoState.stateHash !== stateHash
  ) {
    throw new ConflictError('Conflicting directory revision.');
  }
  const changed =
    !existing ||
    existing.displayName !== state.user.displayName ||
    existing.globalRole !== state.user.role ||
    existing.supernizoState?.eligibility !== state.user.eligibility ||
    existing.supernizoState?.directoryRevision !== revision;
  const user = await transaction.user.upsert({
    where: { supernizoId: state.subject },
    create: {
      supernizoId: state.subject,
      email: `${state.subject}@supernizo.invalid`,
      displayName: state.user.displayName,
      globalRole: state.user.role,
    },
    update: { displayName: state.user.displayName, globalRole: state.user.role },
  });
  const data = {
    eligibility: state.user.eligibility,
    directoryRevision: revision,
    sourceChangedAt: new Date(state.changedAt),
    lastSyncedAt: new Date(),
    stateHash,
  };
  await transaction.supernizoUserState.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  if (changed)
    await transaction.auditLog.create({
      data: {
        action: 'user.directory.synchronized',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          subject: state.subject,
          revision: state.directoryRevision,
          eligibility: state.user.eligibility,
          role: state.user.role,
        },
      },
    });
  return user;
}

export async function synchronizeDirectoryEvent(
  event: DirectoryEvent,
): Promise<'applied' | 'duplicate'> {
  return getDatabaseClient().$transaction(
    async (transaction) => {
      // The event lock also detects reuse of an event ID for a different subject.
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`supernizo-event:${event.eventId}`}, 0))::text`;
      const payloadHash = digest(event);
      const receipt = await transaction.integrationInbox.findUnique({
        where: { eventId: event.eventId },
      });
      if (receipt) {
        if (receipt.payloadHash !== payloadHash)
          throw new ConflictError('Integration event ID was reused.');
        return 'duplicate';
      }
      await applyDirectoryState(transaction, event);
      await transaction.integrationInbox.create({
        data: { eventId: event.eventId, subject: event.subject, payloadHash },
      });
      // Receipts may expire; permanent per-user revisions still prevent stale replay.
      await transaction.$executeRaw`DELETE FROM "IntegrationInbox" WHERE "eventId" IN (SELECT "eventId" FROM "IntegrationInbox" WHERE "processedAt" < now() - interval '30 days' LIMIT 100)`;
      return 'applied';
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}
