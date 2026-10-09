import 'server-only';
import { createProfileService } from '@/server/application/profile/profile-service';
import { createProfileRepository } from '@/server/infrastructure/repositories/profile-repository';

export const { getProfile, updateProfile } = createProfileService({
  repository: createProfileRepository(),
});
