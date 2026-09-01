import { describe, expect, it } from 'vitest';

import { mediaConstraintsForCall } from './media-permissions';

describe('mediaConstraintsForCall', () => {
  it('asks only for a microphone for an audio call', () => {
    expect(mediaConstraintsForCall('AUDIO')).toEqual({ audio: true, video: false });
  });

  it('asks for a microphone and camera for a video call', () => {
    expect(mediaConstraintsForCall('VIDEO')).toEqual({ audio: true, video: true });
  });
});
