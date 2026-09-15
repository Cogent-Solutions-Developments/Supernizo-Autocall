import type { CallStatus } from '@supernizo/shared';

const terminalCallStatuses: readonly CallStatus[] = [
  'CANCELLED',
  'ENDED',
  'FAILED',
  'MISSED',
  'REJECTED',
];

export type CallWorkspaceAccess = 'WORKSPACE' | 'CLAIMED_BY_ANOTHER_AGENT';

export function getCallWorkspaceAccess(
  input: Readonly<{
    assignedAgentId: string | null;
    callStatus: CallStatus;
    userId: string;
  }>,
): CallWorkspaceAccess {
  if (
    input.assignedAgentId === null ||
    input.assignedAgentId === input.userId ||
    terminalCallStatuses.includes(input.callStatus)
  ) {
    return 'WORKSPACE';
  }

  return 'CLAIMED_BY_ANOTHER_AGENT';
}
