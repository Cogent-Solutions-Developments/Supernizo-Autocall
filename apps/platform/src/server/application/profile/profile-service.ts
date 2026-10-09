import 'server-only';
import {
  MAX_PROFILE_PHOTO_BYTES,
  ProfileUpdateSchema,
  type ProfileUpdate,
  type UserProfile,
} from '@supernizo/shared';
import type { ProfileRepository } from '@/server/application/ports/profile-repository';
import { ValidationError } from '@/server/domain/errors/app-error';

function validatePhoto(imageUrl: string | null): void {
  if (!imageUrl?.startsWith('data:')) return;
  const [header, encoded = ''] = imageUrl.split(',');
  const bytes = Buffer.from(encoded, 'base64');
  const png =
    header === 'data:image/png;base64' &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    header === 'data:image/jpeg;base64' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    header === 'data:image/webp;base64' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  if (
    bytes.length > MAX_PROFILE_PHOTO_BYTES ||
    bytes.toString('base64') !== encoded ||
    !(png || jpeg || webp)
  ) {
    throw new ValidationError('Choose a JPG, PNG or WebP photo under 256 KB.');
  }
}

export function createProfileService({ repository }: { repository: ProfileRepository }) {
  return {
    async getProfile(user: {
      id: string;
      name: string | null;
      email: string;
    }): Promise<UserProfile> {
      return (
        (await repository.findProfile(user.id)) ?? {
          displayName: user.name ?? user.email.split('@')[0] ?? 'Team member',
          imageUrl: null,
        }
      );
    },
    async updateProfile(userId: string, input: ProfileUpdate): Promise<UserProfile> {
      const parsed = ProfileUpdateSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Enter a name and a valid profile photo.');
      validatePhoto(parsed.data.imageUrl);
      return repository.saveProfile(userId, parsed.data);
    },
  };
}
