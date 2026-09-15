import { describe, expect, it } from 'vitest';

import { getCallWorkspaceAccess } from './[callId]/call-workspace-access';

describe('call workspace access', () => {
  it('shows a handled state when another agent has accepted a live call', () => {
    expect(
      getCallWorkspaceAccess({
        assignedAgentId: 'agent_1',
        callStatus: 'ACTIVE',
        userId: 'agent_2',
      }),
    ).toBe('CLAIMED_BY_ANOTHER_AGENT');
  });

  it('allows an authorised site agent to see an ended call state', () => {
    expect(
      getCallWorkspaceAccess({
        assignedAgentId: 'agent_1',
        callStatus: 'ENDED',
        userId: 'agent_2',
      }),
    ).toBe('WORKSPACE');
  });

  it('allows an unassigned incoming call to be opened', () => {
    expect(
      getCallWorkspaceAccess({
        assignedAgentId: null,
        callStatus: 'RINGING',
        userId: 'agent_2',
      }),
    ).toBe('WORKSPACE');
  });
});
