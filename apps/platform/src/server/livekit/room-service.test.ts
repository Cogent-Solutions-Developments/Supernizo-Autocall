import { describe, expect, it, vi } from 'vitest';

import { terminateLiveKitRoom } from './room-service';

describe('LiveKit room termination', () => {
  it('deletes the room so every participant is disconnected', async () => {
    const deleteRoom = vi.fn().mockResolvedValue(undefined);

    await expect(terminateLiveKitRoom('call_room', { deleteRoom })).resolves.toBe(true);

    expect(deleteRoom).toHaveBeenCalledWith('call_room');
  });

  it('does not undo a durable call ending when LiveKit is temporarily unavailable', async () => {
    const deleteRoom = vi.fn().mockRejectedValue(new Error('LiveKit unavailable'));

    await expect(terminateLiveKitRoom('call_room', { deleteRoom })).resolves.toBe(false);
  });
});
