import type { StaffRole } from '@supernizo/shared';
export type AuthenticationAccount = Readonly<{
  id: string;
  email: string;
  displayName: string | null;
  globalRole: StaffRole;
  supernizoId: string | null;
}>;
export interface AuthRepository {
  findAccount(userId: string): Promise<AuthenticationAccount | null>;
  findLocalAccount(
    email: string,
  ): Promise<(AuthenticationAccount & { passwordHash: string | null }) | null>;
  findSiteStatus(siteId: string): Promise<{ status: 'ACTIVE' | 'INACTIVE' } | null>;
  saveSupernizoAccount(identity: {
    subject: string;
    email: string;
    name: string;
    role: StaffRole;
  }): Promise<{ id: string; email: string; displayName: string | null }>;
}
