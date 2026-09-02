import { describe, expect, it } from 'vitest';

import {
  CALL_WIDGET_PERMISSIONS_POLICY,
  callWidgetFrameStyles,
  isCallWidgetConfigRefreshDue,
  readCallActionResponse,
} from './call-widget';

describe('call widget mounting', () => {
  it('keeps the call subscription iframe non-interactive until the visitor receives a call', () => {
    const initialStyles = callWidgetFrameStyles(false);

    expect(initialStyles).toContain('height:1px');
    expect(initialStyles).toContain('pointer-events:none');
    expect(initialStyles).toContain('width:1px');
  });

  it('expands and receives pointer input only while presenting a call', () => {
    const visibleStyles = callWidgetFrameStyles(true);

    expect(visibleStyles).toContain('height:560px');
    expect(visibleStyles).toContain('pointer-events:auto');
    expect(visibleStyles).toContain('width:360px');
  });

  it('delegates media permissions to the cross-origin call iframe', () => {
    expect(CALL_WIDGET_PERMISSIONS_POLICY).toBe('microphone; camera');
  });

  it('renews realtime credentials before their one-hour expiry', () => {
    const startedAt = Date.parse('2026-09-02T08:00:00.000Z');

    expect(isCallWidgetConfigRefreshDue(startedAt, 0, startedAt + 44 * 60 * 1_000)).toBe(false);
    expect(isCallWidgetConfigRefreshDue(startedAt, 0, startedAt + 45 * 60 * 1_000)).toBe(true);
  });

  it('paces retries after a failed credential renewal', () => {
    const startedAt = Date.parse('2026-09-02T08:00:00.000Z');
    const expiredAt = startedAt + 45 * 60 * 1_000;

    expect(isCallWidgetConfigRefreshDue(startedAt, expiredAt, expiredAt + 59_999)).toBe(false);
    expect(isCallWidgetConfigRefreshDue(startedAt, expiredAt, expiredAt + 60_000)).toBe(true);
  });

  it('uses media credentials returned with acceptance without another token request', () => {
    const result = readCallActionResponse({
      data: {
        agentAvatarUrl: null,
        agentDisplayName: 'Local Admin',
        id: 'call_123',
        requestedAt: '2026-09-02T08:00:00.000Z',
        roomName: 'call_room',
        siteId: 'site_123',
        status: 'ACCEPTED',
        type: 'VIDEO',
        visitorId: 'visitor_123',
      },
      media: { token: 'livekit-token', url: 'wss://example.livekit.cloud' },
    });

    expect(result?.call.status).toBe('ACCEPTED');
    expect(result?.media).toEqual({
      token: 'livekit-token',
      url: 'wss://example.livekit.cloud',
    });
  });
});
