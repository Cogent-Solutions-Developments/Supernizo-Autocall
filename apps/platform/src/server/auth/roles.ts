import 'server-only';

import type { StaffRole } from '@supernizo/shared';

import { ForbiddenError } from '@/server/errors/app-error';

export function hasRole(role: StaffRole, allowedRoles: readonly StaffRole[]): boolean {
  return allowedRoles.includes(role);
}

export function assertRole(role: StaffRole, allowedRoles: readonly StaffRole[]): void {
  if (!hasRole(role, allowedRoles)) {
    throw new ForbiddenError('You do not have permission to perform this action.');
  }
}

export function canContactVisitors(role: StaffRole): boolean {
  return role === 'ADMIN' || role === 'AGENT';
}
