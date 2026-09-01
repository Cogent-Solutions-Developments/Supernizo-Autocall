import { describe, expect, it } from 'vitest';

import { shouldOpenChatForNewAgentMessage } from './chat-widget';

describe('chat widget activation', () => {
  it('does not open the chat iframe for the initial history sync', () => {
    expect(shouldOpenChatForNewAgentMessage(false, undefined, 'message-1')).toBe(false);
  });

  it('opens the chat iframe when an agent message arrives after the initial sync', () => {
    expect(shouldOpenChatForNewAgentMessage(true, undefined, 'message-1')).toBe(true);
    expect(shouldOpenChatForNewAgentMessage(true, 'message-1', 'message-2')).toBe(true);
  });

  it('keeps the iframe inactive when the latest message has not changed', () => {
    expect(shouldOpenChatForNewAgentMessage(true, 'message-1', 'message-1')).toBe(false);
  });
});
