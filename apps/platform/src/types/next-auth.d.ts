import type { StaffRole } from '@supernizo/shared';
import type { DefaultSession } from 'next-auth';
import type { SupernizoIdentity } from '@/server/auth/supernizo-sso';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: StaffRole;
      supernizo?: SupernizoIdentity | undefined;
    };
  }

  interface User {
    role?: StaffRole;
    supernizo?: SupernizoIdentity | undefined;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: StaffRole;
    userId?: string;
    supernizo?: SupernizoIdentity | undefined;
  }
}
