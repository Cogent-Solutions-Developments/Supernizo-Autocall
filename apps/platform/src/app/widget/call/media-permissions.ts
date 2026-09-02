import type { Call } from '@supernizo/shared';

type MediaPreview = Readonly<{
  getTracks: () => readonly Readonly<{ stop: () => void }>[];
}>;

export type MediaPermission = 'camera' | 'microphone';
export type MediaRequester = (constraints: MediaStreamConstraints) => Promise<MediaPreview>;

export class MediaPermissionError extends Error {
  public constructor(public readonly permission: MediaPermission) {
    super(`${permission} access was not granted.`);
    this.name = 'MediaPermissionError';
  }
}

async function requestAndRelease(
  constraints: MediaStreamConstraints,
  requestMedia: MediaRequester,
  permission: MediaPermission,
): Promise<void> {
  try {
    const stream = await requestMedia(constraints);
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    throw new MediaPermissionError(permission);
  }
}

export async function requestMediaPermissions(
  type: Call['type'],
  requestMedia: MediaRequester,
): Promise<void> {
  if (type === 'VIDEO') {
    await requestAndRelease({ audio: true, video: true }, requestMedia, 'camera');
    return;
  }
  await requestAndRelease({ audio: true, video: false }, requestMedia, 'microphone');
}
