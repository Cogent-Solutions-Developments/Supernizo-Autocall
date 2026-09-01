import type { Call } from '@supernizo/shared';

type DisplayCall = Pick<Call, 'status' | 'type'>;

function isMediaCallStatus(status: Call['status']): boolean {
  return status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE';
}

export function callHeading(call: DisplayCall, mediaConnected: boolean): string {
  if (call.status === 'RINGING') {
    return call.type === 'VIDEO' ? 'Incoming video call' : 'Incoming audio call';
  }
  if (call.status === 'ACTIVE' || (mediaConnected && isMediaCallStatus(call.status))) {
    return 'Call connected';
  }
  if (call.status === 'ACCEPTED' || call.status === 'CONNECTING') return 'Call connecting';
  return `Call ${call.status.toLowerCase()}`;
}

export function callCopy(call: DisplayCall, hasMedia: boolean, mediaConnected: boolean): string {
  if (call.status === 'RINGING') {
    return call.type === 'VIDEO'
      ? 'Accept to speak with the event team using your camera and microphone.'
      : 'Accept to speak directly with the event team.';
  }
  if (call.status === 'ACTIVE' || (mediaConnected && isMediaCallStatus(call.status))) {
    return 'You are connected through a secure private call.';
  }
  return hasMedia
    ? 'Connecting to the secure media room.'
    : 'Preparing your secure media connection.';
}
