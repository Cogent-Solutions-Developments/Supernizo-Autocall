import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const transaction = {
    $queryRaw: vi.fn(),
    call: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    callEvent: { create: vi.fn() },
  };
  const runTransaction = vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
    work(transaction),
  );
  return { transaction, runTransaction, rootUpdate: vi.fn() };
});
vi.mock('@/server/infrastructure/db/client', () => ({
  getDatabaseClient: () => ({
    $transaction: mocks.runTransaction,
    call: { updateMany: mocks.rootUpdate },
  }),
}));
import { createCallRepository } from './call-repository';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.call.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.callEvent.create.mockResolvedValue({});
  mocks.transaction.call.findUniqueOrThrow.mockResolvedValue({ id: 'call-1' });
});
describe('call repository unit of work', () => {
  it('binds locks, conditional claims, and events to the transaction client', async () => {
    const repository = createCallRepository();
    const options = { maxWait: 5000, timeout: 10000 };
    await repository.transaction(async (tx) => {
      await tx.lockParticipants('agent-1', 'visitor-1');
      await tx.claimIncomingCall('call-1', 'agent-1');
      await tx.recordClaim('call-1');
      return tx.getClaimedCall('call-1');
    }, options);
    expect(mocks.runTransaction).toHaveBeenCalledWith(expect.any(Function), options);
    expect(mocks.rootUpdate).not.toHaveBeenCalled();
    expect(
      mocks.transaction.$queryRaw.mock.calls.map(([query]) => ({
        text: query.text,
        values: query.values,
      })),
    ).toEqual([
      { text: 'SELECT id FROM "User" WHERE id = $1 FOR UPDATE', values: ['agent-1'] },
      { text: 'SELECT id FROM "Visitor" WHERE id = $1 FOR UPDATE', values: ['visitor-1'] },
    ]);
    expect(mocks.transaction.call.updateMany).toHaveBeenCalledWith({
      where: { agentId: null, id: 'call-1', status: 'RINGING', visitorInitiated: true },
      data: { agentId: 'agent-1', respondedAt: expect.any(Date), status: 'ACCEPTED' },
    });
    expect(mocks.transaction.callEvent.create).toHaveBeenCalledWith({
      data: { callId: 'call-1', payload: { to: 'ACCEPTED' }, type: 'ACCEPTED' },
    });
  });
  it('propagates event-write errors through the transaction callback', async () => {
    const failure = new Error('write failed');
    mocks.transaction.callEvent.create.mockRejectedValueOnce(failure);
    await expect(
      createCallRepository().transaction(async (tx) => {
        await tx.claimIncomingCall('call-1', 'agent-1');
        await tx.recordClaim('call-1');
        return tx.getClaimedCall('call-1');
      }),
    ).rejects.toBe(failure);
    expect(mocks.transaction.call.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
