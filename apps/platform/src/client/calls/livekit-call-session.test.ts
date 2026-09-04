import { describe, expect, it, vi } from 'vitest';
import type { LocalTrack, Room } from 'livekit-client';

import {
  captureCallMediaTracks,
  createPreparedCallRoom,
  stopCallMediaTracks,
} from './livekit-call-session';

describe('LiveKit call session helpers', () => {
  it('prepares a room with the scoped token when one is available', async () => {
    const prepareConnection = vi.fn().mockResolvedValue(undefined);
    const room = { prepareConnection } as unknown as Room;

    const prepared = createPreparedCallRoom(
      'wss://example.livekit.cloud',
      'scoped-token',
      () => room,
    );

    await expect(prepared.preparation).resolves.toBe(true);
    expect(prepared.room).toBe(room);
    expect(prepareConnection).toHaveBeenCalledWith('wss://example.livekit.cloud', 'scoped-token');
  });

  it('keeps prewarming failure non-fatal so normal connection can retry', async () => {
    const room = {
      prepareConnection: vi.fn().mockRejectedValue(new Error('temporary network failure')),
    } as unknown as Room;

    const prepared = createPreparedCallRoom('wss://example.livekit.cloud', undefined, () => room);

    await expect(prepared.preparation).resolves.toBe(false);
  });

  it('captures both tracks once for video and leaves them running for publication', async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }] as unknown as readonly LocalTrack[];
    const capture = vi.fn().mockResolvedValue(tracks);

    await expect(captureCallMediaTracks('VIDEO', capture)).resolves.toBe(tracks);
    expect(capture).toHaveBeenCalledWith({ audio: true, video: true });
    tracks.forEach((track) => expect(track.stop).not.toHaveBeenCalled());
  });

  it('stops every retained track during cleanup', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }] as unknown as readonly LocalTrack[];

    stopCallMediaTracks(tracks);

    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
  });
});
