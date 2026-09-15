import type { CallStatus } from '@supernizo/shared';

const terminalCallStatuses: readonly CallStatus[] = [
  'CANCELLED',
  'ENDED',
  'FAILED',
  'MISSED',
  'REJECTED',
];

export function isTerminalCallStatus(status: CallStatus): boolean {
  return terminalCallStatuses.includes(status);
}

export function canConnectAgentMedia(status: CallStatus, acceptedByCurrentAgent: boolean): boolean {
  return (
    acceptedByCurrentAgent &&
    (status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE')
  );
}

export function terminalCallMessage(status: CallStatus): string {
  if (status === 'CANCELLED') return 'The visitor cancelled this call.';
  if (status === 'ENDED') return 'Call was ended.';
  return 'This call is no longer available.';
}
