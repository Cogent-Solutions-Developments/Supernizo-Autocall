import { describe, expect, it } from 'vitest';

import { chatWidgetFrameStyles, shouldOpenChatForNewAgentMessage } from './chat-widget';

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

describe('chat widget frame', () => {
  it('matches the visible call widget footprint', () => {
    const styles = chatWidgetFrameStyles();

    expect(styles).toContain('height:500px');
    expect(styles).toContain('width:330px');
    expect(styles).toContain('max-width:calc(100vw - 32px)');
  });
});
