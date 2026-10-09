import type { ProfileUpdate, UserProfile } from '@supernizo/shared';

export interface ProfileRepository {
  findProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(userId: string, input: ProfileUpdate): Promise<UserProfile>;
}
