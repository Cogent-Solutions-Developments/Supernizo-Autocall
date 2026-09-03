import { describe, expect, it } from 'vitest';

import {
  CHAT_LAUNCHER_COLLAPSE_AFTER_MS,
  CHAT_LAUNCHER_COLLAPSED_HEIGHT_PX,
  chatWidgetFrameStyles,
  shouldOpenChatForNewAgentMessage,
  shouldScheduleChatLauncherCollapse,
} from './chat-widget';

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

    expect(styles).toContain('height:min(540px,calc(100vh - 32px))');
    expect(styles).toContain('width:350px');
    expect(styles).toContain('max-width:calc(100vw - 32px)');
    expect(styles).toContain('border-radius:22px');
    expect(styles).toContain('transform-origin:bottom right');
  });
});

describe('chat launcher idle collapse', () => {
  it('waits 15 seconds before collapsing the full profile card', () => {
    expect(CHAT_LAUNCHER_COLLAPSE_AFTER_MS).toBe(15_000);
  });

  it('uses the compact height required for equal outer spacing', () => {
    expect(CHAT_LAUNCHER_COLLAPSED_HEIGHT_PX).toBe(54);
  });

  it('only schedules the collapse while there is no active call', () => {
    expect(shouldScheduleChatLauncherCollapse(false, false)).toBe(true);
    expect(shouldScheduleChatLauncherCollapse(true, false)).toBe(false);
    expect(shouldScheduleChatLauncherCollapse(false, true)).toBe(false);
  });
});
