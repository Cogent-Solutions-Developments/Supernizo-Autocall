import { describe, expect, it } from 'vitest';

import { getCallFailureReason } from './call-history-service';

describe('getCallFailureReason', () => {
  it('explains LiveKit failures without exposing internal details', () => {
    expect(getCallFailureReason('FAILED', 'MEDIA_CONNECTION_ABORTED')).toContain(
      'could not establish',
    );
    expect(getCallFailureReason('FAILED', 'MEDIA_PARTICIPANT_LEFT')).toContain('left before');
    expect(getCallFailureReason('FAILED', 'MEDIA_ROOM_FINISHED')).toContain('closed before');
  });
});
