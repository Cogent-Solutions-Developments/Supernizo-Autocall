import type { StaffRole } from '@supernizo/shared';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: StaffRole;
    };
  }

  interface User {
    role?: StaffRole;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: StaffRole;
    userId?: string;
  }
}
