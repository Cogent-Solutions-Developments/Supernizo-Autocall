import { describe, expect, it } from 'vitest';

import { updateEventAssignment } from './access-management-state';

describe('event assignment state', () => {
  it('adds and removes an event without duplicating assignments', () => {
    expect(updateEventAssignment(['event-2'], 'event-1', true)).toEqual(['event-1', 'event-2']);
    expect(updateEventAssignment(['event-1', 'event-2'], 'event-1', false)).toEqual(['event-2']);
  });
});
