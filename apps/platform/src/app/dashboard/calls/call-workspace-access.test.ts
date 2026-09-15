import { describe, expect, it } from 'vitest';

import { canOpenCallWorkspace } from './[callId]/call-workspace-access';

describe('call workspace access', () => {
  it('keeps a live call private to its assigned agent', () => {
    expect(
      canOpenCallWorkspace({
        assignedAgentId: 'agent_1',
        callStatus: 'ACTIVE',
        userId: 'agent_2',
      }),
    ).toBe(false);
  });

  it('allows an authorised site agent to see an ended call state', () => {
    expect(
      canOpenCallWorkspace({
        assignedAgentId: 'agent_1',
        callStatus: 'ENDED',
        userId: 'agent_2',
      }),
    ).toBe(true);
  });

  it('allows an unassigned incoming call to be opened', () => {
    expect(
      canOpenCallWorkspace({
        assignedAgentId: null,
        callStatus: 'RINGING',
        userId: 'agent_2',
      }),
    ).toBe(true);
  });
});
