import type { Call } from '@supernizo/shared';

export type MediaPermission = 'camera' | 'microphone';
export type CallMediaConstraints = Readonly<{ audio: boolean; video: boolean }>;
export type MediaRequester<TTrack> = (
  constraints: CallMediaConstraints,
) => Promise<readonly TTrack[]>;

export class MediaPermissionError extends Error {
  public constructor(public readonly permission: MediaPermission) {
    super(`${permission} access was not granted.`);
    this.name = 'MediaPermissionError';
  }
}

async function requestTracks<TTrack>(
  constraints: CallMediaConstraints,
  requestMedia: MediaRequester<TTrack>,
  permission: MediaPermission,
): Promise<readonly TTrack[]> {
  try {
    return await requestMedia(constraints);
  } catch {
    throw new MediaPermissionError(permission);
  }
}

export async function requestMediaPermissions<TTrack>(
  type: Call['type'],
  requestMedia: MediaRequester<TTrack>,
): Promise<readonly TTrack[]> {
  if (type === 'VIDEO') {
    return requestTracks({ audio: true, video: true }, requestMedia, 'camera');
  }
  return requestTracks({ audio: true, video: false }, requestMedia, 'microphone');
}
