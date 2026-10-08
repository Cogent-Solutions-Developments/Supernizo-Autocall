import type {
  SupernizoDirectoryRepository,
  SupernizoDirectoryRepositorySession,
} from '@/server/application/ports/supernizo-directory-repository';
import 'server-only';
import { createHash } from 'node:crypto';
import { ConflictError, UnauthorizedError } from '@/server/domain/errors/app-error';
import type { DirectoryEvent, DirectoryState } from '@/server/domain/directory/supernizo-contract';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';

export function createSupernizoDirectoryService(
  dependencies: Pick<RuntimeProviders, 'fetchDirectoryUser' | 'directorySyncEnabled'> & {
    repository: SupernizoDirectoryRepository;
  },
) {
  const { repository, fetchDirectoryUser, directorySyncEnabled } = dependencies;
  function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async function lockDirectoryUser(
    transaction: SupernizoDirectoryRepositorySession,
    subject: string,
  ): Promise<void> {
    // Shared by SSO and directory event delivery. Works across replicas.
    await transaction.lockUser(subject);
  }

  async function applyDirectoryState(
    transaction: SupernizoDirectoryRepositorySession,
    state: DirectoryState,
  ) {
    await lockDirectoryUser(transaction, state.subject);
    const existing = await transaction.findDirectoryUser(state);
    if (!existing && (await transaction.findConflictingAccount(state))) {
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
    const user = await transaction.saveDirectoryUser(state);
    const data = {
      eligibility: state.user.eligibility,
      directoryRevision: revision,
      sourceChangedAt: new Date(state.changedAt),
      lastSyncedAt: new Date(),
      stateHash,
    };
    await transaction.saveDirectoryState(user, data);
    if (changed) await transaction.recordSynchronization(user, state);
    return user;
  }

  async function synchronizeDirectoryEvent(
    event: DirectoryEvent,
  ): Promise<'applied' | 'duplicate'> {
    return repository.transaction(
      async (transaction) => {
        // The event lock also detects reuse of an event ID for a different subject.
        await transaction.lockEvent(event.eventId);
        const payloadHash = digest(event);
        const receipt = await transaction.findReceipt(event);
        if (receipt) {
          if (receipt.payloadHash !== payloadHash)
            throw new ConflictError('Integration event ID was reused.');
          return 'duplicate';
        }
        await applyDirectoryState(transaction, event);
        await transaction.saveReceipt(event, payloadHash);
        // Receipts may expire; permanent per-user revisions still prevent stale replay.
        await transaction.pruneReceipts();
        return 'applied';
      },
      { maxWait: 5_000, timeout: 10_000 },
    );
  }

  async function synchronizeDirectoryState(state: DirectoryState) {
    return repository.transaction((tx) => applyDirectoryState(tx, state));
  }
  async function provisionDirectoryIdentity(subject: string) {
    const state = await fetchDirectoryUser(subject);
    return repository.transaction(async (tx) => {
      const user = await applyDirectoryState(tx, state);
      const current = await tx.getEligibility(user.id);
      if (current.eligibility !== 'ELIGIBLE')
        throw new UnauthorizedError('Autocall access is not assigned.');
      return user;
    });
  }
  async function reconcileDirectoryUsers(): Promise<number> {
    if (!directorySyncEnabled())
      throw new Error('Enable directory synchronization before reconciling existing SSO users.');
    let cursor: string | undefined;
    let synchronized = 0;
    while (true) {
      const users = await repository.listAccounts(cursor);
      if (!users.length) break;
      for (const user of users) {
        if (!user.supernizoId) continue;
        const state = await fetchDirectoryUser(user.supernizoId);
        await synchronizeDirectoryState(state);
        synchronized++;
      }
      cursor = users.at(-1)?.id;
    }
    return synchronized;
  }
  return {
    lockDirectoryUser,
    applyDirectoryState,
    synchronizeDirectoryEvent,
    synchronizeDirectoryState,
    provisionDirectoryIdentity,
    reconcileDirectoryUsers,
  };
}
