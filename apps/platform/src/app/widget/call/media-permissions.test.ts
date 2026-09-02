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

  it('asks for microphone and camera access together for a video call', async () => {
    const requestMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });

    await requestMediaPermissions('VIDEO', requestMedia);

    expect(requestMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(requestMedia).toHaveBeenCalledTimes(1);
  });

  it('identifies blocked video-call media as a camera permission failure', async () => {
    const requestMedia = vi.fn().mockRejectedValue(new Error('Camera permission denied.'));

    await expect(requestMediaPermissions('VIDEO', requestMedia)).rejects.toEqual(
      expect.objectContaining<Partial<MediaPermissionError>>({ permission: 'camera' }),
    );
  });
});
