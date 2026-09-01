import { describe, expect, it, vi } from 'vitest';

import { MediaPermissionError, requestMediaPermissions } from './media-permissions';

describe('requestMediaPermissions', () => {
  it('asks only for a microphone for an audio call', async () => {
    const stop = vi.fn();
    const requestMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });

    await requestMediaPermissions('AUDIO', requestMedia);

    expect(requestMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(requestMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('asks for microphone and camera access separately for a video call', async () => {
    const requestMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });

    await requestMediaPermissions('VIDEO', requestMedia);

    expect(requestMedia).toHaveBeenNthCalledWith(1, { audio: true, video: false });
    expect(requestMedia).toHaveBeenNthCalledWith(2, { audio: false, video: true });
  });

  it('identifies a blocked camera after microphone access has been granted', async () => {
    const requestMedia = vi
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [] })
      .mockRejectedValueOnce(new Error('Camera permission denied.'));

    await expect(requestMediaPermissions('VIDEO', requestMedia)).rejects.toEqual(
      expect.objectContaining<Partial<MediaPermissionError>>({ permission: 'camera' }),
    );
  });
});
