import { z } from 'zod';

export const MAX_PROFILE_PHOTO_BYTES = 256 * 1024;

export const ProfileImageSchema = z
  .string()
  .trim()
  .max(350_000)
  .refine((value) => {
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
    if (value.length > 2048) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use a JPG, PNG or WebP photo, or an http or https image URL.')
  .nullable();

export const ProfileUpdateSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(191),
  imageUrl: ProfileImageSchema,
});
export const UserProfileSchema = ProfileUpdateSchema;
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
