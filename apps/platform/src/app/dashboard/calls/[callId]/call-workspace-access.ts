import type { CallStatus } from '@supernizo/shared';

const terminalCallStatuses: readonly CallStatus[] = [
  'CANCELLED',
  'ENDED',
  'FAILED',
  'MISSED',
  'REJECTED',
];

export function canOpenCallWorkspace(input: Readonly<{
  assignedAgentId: string | null;
  callStatus: CallStatus;
  userId: string;
}>): boolean {
  return (
    input.assignedAgentId === null ||
    input.assignedAgentId === input.userId ||
    terminalCallStatuses.includes(input.callStatus)
  );
}
