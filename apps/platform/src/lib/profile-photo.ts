import { MAX_PROFILE_PHOTO_BYTES } from '@supernizo/shared';
export async function readProfilePhoto(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > MAX_PROFILE_PHOTO_BYTES ||
    file.size === 0
  )
    throw new Error('Choose a JPG, PNG or WebP photo under 256 KB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The photo could not be read.'));
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
}
