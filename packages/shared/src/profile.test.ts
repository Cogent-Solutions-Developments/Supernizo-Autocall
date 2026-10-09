import { describe, expect, it } from 'vitest';
import { ProfileUpdateSchema } from './profile';

describe('profile input', () => {
  it('trims names and allows removing the photo', () => {
    expect(ProfileUpdateSchema.parse({ displayName: '  Alex Smith  ', imageUrl: null })).toEqual({
      displayName: 'Alex Smith',
      imageUrl: null,
    });
  });
  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'https://user:secret@example.com/photo.jpg',
    'file:///photo.png',
  ])('rejects unsafe photo URLs: %s', (imageUrl) => {
    expect(ProfileUpdateSchema.safeParse({ displayName: 'Alex', imageUrl }).success).toBe(false);
  });
  it('rejects blank names, oversized names and extra identity fields', () => {
    for (const input of [
      { displayName: ' ', imageUrl: null },
      { displayName: 'a'.repeat(192), imageUrl: null },
      { displayName: 'Alex', imageUrl: null, userId: 'another-user' },
    ])
      expect(ProfileUpdateSchema.safeParse(input).success).toBe(false);
  });
  it('accepts image links and supported raster uploads', () => {
    expect(
      ProfileUpdateSchema.safeParse({
        displayName: 'Alex',
        imageUrl: 'https://example.com/photo.jpg',
      }).success,
    ).toBe(true);
    expect(
      ProfileUpdateSchema.safeParse({
        displayName: 'Alex',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      }).success,
    ).toBe(true);
  });
});
