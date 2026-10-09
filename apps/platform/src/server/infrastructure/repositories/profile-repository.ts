import 'server-only';
import type { ProfileRepository } from '@/server/application/ports/profile-repository';
import { getDatabaseClient } from '@/server/infrastructure/db/client';

const select = { displayName: true, imageUrl: true } as const;
export function createProfileRepository(): ProfileRepository {
  return {
    findProfile: (userId) =>
      getDatabaseClient().userProfile.findUnique({ where: { userId }, select }),
    saveProfile: (userId, input) =>
      getDatabaseClient().userProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
        select,
      }),
  };
}
