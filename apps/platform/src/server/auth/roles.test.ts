import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/server/errors/app-error';
import { assertRole, canContactVisitors, hasRole } from './roles';

describe('dashboard role restrictions', () => {
  it('does not allow an agent to perform an administrator mutation', () => {
    expect(() => assertRole('AGENT', ['ADMIN'])).toThrow(ForbiddenError);
    expect(hasRole('AGENT', ['ADMIN'])).toBe(false);
  });

  it('allows both supported roles to contact visitors', () => {
    expect(canContactVisitors('ADMIN')).toBe(true);
    expect(canContactVisitors('AGENT')).toBe(true);
  });
});
