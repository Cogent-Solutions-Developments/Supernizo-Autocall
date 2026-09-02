import { describe, expect, it } from 'vitest';

import { deriveLiveKitMediaState, getLiveKitMediaErrorMessage } from './livekit-media-state';

const connectedAudioSnapshot = {
  localMicrophonePublished: true,
  remoteCameraSubscribed: false,
  remoteMicrophoneSubscribed: true,
  remoteParticipantPresent: true,
  transportConnected: true,
  videoEnabled: false,
} as const;

describe('deriveLiveKitMediaState', () => {
  it('does not report connected when only signaling is connected', () => {
    expect(
      deriveLiveKitMediaState({
        ...connectedAudioSnapshot,
        remoteMicrophoneSubscribed: false,
        remoteParticipantPresent: false,
      }),
    ).toMatchObject({ connected: false, message: 'Waiting for the other participant...' });
  });

  it('reports an audio call connected only when remote audio is subscribed', () => {
    expect(deriveLiveKitMediaState(connectedAudioSnapshot)).toEqual({
      connected: true,
      message: 'Connected',
      videoReady: false,
    });
  });

  it('keeps a video call usable while clearly reporting a delayed remote camera', () => {
    expect(deriveLiveKitMediaState({ ...connectedAudioSnapshot, videoEnabled: true })).toEqual({
      connected: true,
      message: 'Connected · waiting for video',
      videoReady: false,
    });
  });
});

describe('getLiveKitMediaErrorMessage', () => {
  it('returns specific, safe guidance for device, permission, and network failures', () => {
    expect(getLiveKitMediaErrorMessage(new Error('NotAllowedError: permission denied'))).toContain(
      'site settings',
    );
    expect(getLiveKitMediaErrorMessage(new Error('NotFoundError: no device'))).toContain(
      'unavailable',
    );
    expect(getLiveKitMediaErrorMessage(new Error('ICE network failed'))).toContain('firewall');
    expect(getLiveKitMediaErrorMessage('PermissionDenied')).toContain('site settings');
  });
});
