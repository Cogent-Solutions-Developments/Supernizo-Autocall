import { describe, expect, it } from 'vitest';

import type { Call } from '@supernizo/shared';

import { callCopy, callHeading } from './call-display';

const audioConnecting = { status: 'CONNECTING', type: 'AUDIO' } satisfies Pick<
  Call,
  'status' | 'type'
>;
const videoConnecting = { status: 'CONNECTING', type: 'VIDEO' } satisfies Pick<
  Call,
  'status' | 'type'
>;

describe('connected call presentation', () => {
  it.each([audioConnecting, videoConnecting])(
    'shows a connected heading when $type media has connected',
    (call) => {
      expect(callHeading(call, true)).toBe('Call connected');
      expect(callCopy(call, true, true)).toBe('You are connected through a secure private call.');
    },
  );

  it('keeps the connecting message until the media room connects', () => {
    expect(callHeading(audioConnecting, false)).toBe('Call connecting');
    expect(callCopy(audioConnecting, true, false)).toBe('Connecting to the secure media room.');
  });
});
