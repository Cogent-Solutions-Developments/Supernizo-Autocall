import { describe, expect, it } from 'vitest';

import {
  canConnectAgentMedia,
  isTerminalCallStatus,
  terminalCallMessage,
} from './incoming-call-workspace-state';

describe('incoming call workspace state', () => {
  it('does not connect media for a call accepted by another agent', () => {
    expect(canConnectAgentMedia('ACCEPTED', false)).toBe(false);
    expect(canConnectAgentMedia('ACCEPTED', true)).toBe(true);
  });

  it('recognizes a visitor cancellation as terminal', () => {
    expect(isTerminalCallStatus('CANCELLED')).toBe(true);
    expect(terminalCallMessage('CANCELLED')).toBe('The visitor cancelled this call.');
  });
});
