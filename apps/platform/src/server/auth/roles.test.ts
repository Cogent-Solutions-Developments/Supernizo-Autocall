import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/server/errors/app-error';
import { assertRole, canContactVisitors, hasRole } from './roles';

describe('dashboard role restrictions', () => {
  it('does not allow a viewer to perform an administrator mutation', () => {
    expect(() => assertRole('VIEWER', ['ADMIN'])).toThrow(ForbiddenError);
    expect(hasRole('VIEWER', ['ADMIN'])).toBe(false);
  });

  it('allows agents and administrators, but not viewers, to contact visitors', () => {
    expect(canContactVisitors('ADMIN')).toBe(true);
    expect(canContactVisitors('AGENT')).toBe(true);
    expect(canContactVisitors('VIEWER')).toBe(false);
  });
});
