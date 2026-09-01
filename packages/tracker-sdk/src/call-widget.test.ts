import { describe, expect, it } from 'vitest';

import { CALL_WIDGET_PERMISSIONS_POLICY, callWidgetFrameStyles } from './call-widget';

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
});
