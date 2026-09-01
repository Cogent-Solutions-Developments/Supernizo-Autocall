import type { Call } from '@supernizo/shared';

export function mediaConstraintsForCall(type: Call['type']): MediaStreamConstraints {
  return {
    audio: true,
    video: type === 'VIDEO',
  };
}
