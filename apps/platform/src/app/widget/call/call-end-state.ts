import type { Call } from '@supernizo/shared';

export function optimisticallyEndCall(call: Call): Call {
  return { ...call, status: 'ENDED' };
}

export function shouldIgnoreCallUpdate(callId: string, endingCallId: string | null): boolean {
  return callId === endingCallId;
}
