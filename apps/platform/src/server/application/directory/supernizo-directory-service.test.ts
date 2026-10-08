import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createSupernizoDirectoryService } from './supernizo-directory-service';
import type {
  SupernizoDirectoryRepository,
  FindDirectoryUserResult,
} from '../ports/supernizo-directory-repository';
import type { DirectoryState } from '@/server/domain/directory/supernizo-contract';
import { ConflictError, UnauthorizedError } from '@/server/domain/errors/app-error';
const state: DirectoryState = {
  subject: 'subject-1',
  directoryRevision: '2',
  changedAt: '2026-09-07T14:00:00.000Z',
  user: { displayName: 'Agent', role: 'AGENT', eligibility: 'ELIGIBLE' },
};
const existing: NonNullable<FindDirectoryUserResult> = {
  id: 'user-1',
  email: 'subject-1@supernizo.invalid',
  supernizoId: 'subject-1',
  displayName: 'Agent',
  passwordHash: null,
  globalRole: 'AGENT',
  createdAt: new Date(),
  updatedAt: new Date(),
  supernizoState: {
    userId: 'user-1',
    directoryRevision: 3n,
    eligibility: 'REVOKED',
    sourceChangedAt: new Date(),
    lastSyncedAt: new Date(),
    stateHash: 'newer-state',
  },
};
function setup() {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected write');
  };
  const repository: SupernizoDirectoryRepository = {
    findDirectoryUser: vi.fn(async () => existing),
    findConflictingAccount: unexpected,
    saveDirectoryUser: vi.fn(unexpected),
    saveDirectoryState: unexpected,
    recordSynchronization: unexpected,
    findReceipt: vi.fn(async () => null),
    saveReceipt: unexpected,
    lockUser: vi.fn(async () => {}),
    lockEvent: vi.fn(async () => {}),
    pruneReceipts: vi.fn(async () => {}),
    getEligibility: vi.fn(async () => ({ eligibility: 'REVOKED' })),
    listAccounts: vi.fn(async () => []),
    transaction: vi.fn(async (work) => work(repository)),
  };
  const fetchDirectoryUser = vi.fn(async () => state);
  return {
    repository,
    fetchDirectoryUser,
    service: createSupernizoDirectoryService({
      repository,
      fetchDirectoryUser,
      directorySyncEnabled: () => true,
    }),
  };
}
describe('directory unit of work', () => {
  it('ignores a stale grant while retaining the newer account', async () => {
    const { service, repository } = setup();
    expect(await service.synchronizeDirectoryState(state)).toBe(existing);
    expect(repository.lockUser).toHaveBeenCalledWith(state.subject);
    expect(repository.saveDirectoryUser).not.toHaveBeenCalled();
  });
  it('rejects conflicting equal revisions', async () => {
    const { service, repository } = setup();
    vi.mocked(repository.findDirectoryUser).mockResolvedValue({
      ...existing,
      supernizoState: { ...existing.supernizoState!, directoryRevision: 2n },
    });
    await expect(service.synchronizeDirectoryState(state)).rejects.toBeInstanceOf(ConflictError);
    expect(repository.saveDirectoryUser).not.toHaveBeenCalled();
  });
  it('checks durable eligibility after synchronization before allowing SSO', async () => {
    const { service, repository, fetchDirectoryUser } = setup();
    await expect(service.provisionDirectoryIdentity(state.subject)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(fetchDirectoryUser).toHaveBeenCalledWith(state.subject);
    expect(repository.getEligibility).toHaveBeenCalledWith('user-1');
    expect(repository.transaction).toHaveBeenCalledOnce();
  });
  it('deduplicates matching events and rejects event ID reuse', async () => {
    const { service, repository } = setup();
    const event = { ...state, eventId: 'event-1', schemaVersion: 1 as const };
    vi.mocked(repository.findReceipt).mockResolvedValue({
      eventId: event.eventId,
      subject: state.subject,
      processedAt: new Date(),
      payloadHash: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
    });
    await expect(service.synchronizeDirectoryEvent(event)).resolves.toBe('duplicate');
    expect(repository.saveDirectoryUser).not.toHaveBeenCalled();
    await expect(
      service.synchronizeDirectoryEvent({ ...event, subject: 'another-subject' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
