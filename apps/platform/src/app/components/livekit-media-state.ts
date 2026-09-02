export type LiveKitMediaSnapshot = Readonly<{
  localMicrophonePublished: boolean;
  remoteCameraSubscribed: boolean;
  remoteMicrophoneSubscribed: boolean;
  remoteParticipantPresent: boolean;
  transportConnected: boolean;
  videoEnabled: boolean;
}>;

export type LiveKitMediaState = Readonly<{
  connected: boolean;
  message: string;
  videoReady: boolean;
}>;

export function deriveLiveKitMediaState(snapshot: LiveKitMediaSnapshot): LiveKitMediaState {
  if (!snapshot.transportConnected) {
    return { connected: false, message: 'Connecting securely...', videoReady: false };
  }
  if (!snapshot.localMicrophonePublished) {
    return { connected: true, message: 'Connected - starting microphone', videoReady: false };
  }
  if (!snapshot.remoteParticipantPresent) {
    return {
      connected: true,
      message: 'Connected - waiting for the other participant',
      videoReady: false,
    };
  }
  if (!snapshot.remoteMicrophoneSubscribed) {
    return { connected: true, message: 'Connected - connecting audio', videoReady: false };
  }
  if (snapshot.videoEnabled && !snapshot.remoteCameraSubscribed) {
    return { connected: true, message: 'Connected - waiting for video', videoReady: false };
  }
  return { connected: true, message: 'Connected', videoReady: snapshot.videoEnabled };
}

export function getLiveKitMediaErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  if (!rawMessage) {
    return 'The media connection failed. Check your network and try again.';
  }
  const message = rawMessage.toLowerCase();
  if (message.includes('permission') || message.includes('notallowed')) {
    return 'Camera or microphone access is blocked. Allow access in browser site settings and retry.';
  }
  if (message.includes('device') || message.includes('notfound')) {
    return 'A required camera or microphone is unavailable. Check the device and retry.';
  }
  if (message.includes('ice') || message.includes('network') || message.includes('signal')) {
    return 'The media network connection failed. Check your firewall or network and try again.';
  }
  return 'The media connection failed. Check your network and try again.';
}
