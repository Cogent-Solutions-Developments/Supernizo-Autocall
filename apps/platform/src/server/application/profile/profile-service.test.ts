import { beforeEach, expect, it, vi } from 'vitest';
import type { ProfileRepository } from '@/server/application/ports/profile-repository';
import { createProfileService } from './profile-service';

const repository: ProfileRepository = { findProfile: vi.fn(), saveProfile: vi.fn() };
const service = createProfileService({ repository });
const user = { id: 'agent-1', name: 'Directory name', email: 'agent@example.com' };
beforeEach(() => vi.resetAllMocks());

it('uses the directory name before a profile is saved', async () => {
  vi.mocked(repository.findProfile).mockResolvedValue(null);
  expect(await service.getProfile(user)).toEqual({ displayName: 'Directory name', imageUrl: null });
  expect(await service.getProfile({ ...user, name: null })).toEqual({
    displayName: 'agent',
    imageUrl: null,
  });
});
it('keeps a saved profile when the directory name changes', async () => {
  vi.mocked(repository.findProfile).mockResolvedValue({
    displayName: 'Custom name',
    imageUrl: 'https://example.com/avatar.jpg',
  });
  expect((await service.getProfile(user)).displayName).toBe('Custom name');
});
it('updates only the authenticated profile with validated values', async () => {
  const profile = { displayName: 'Alex', imageUrl: null };
  vi.mocked(repository.saveProfile).mockResolvedValue(profile);
  expect(await service.updateProfile('agent-1', { ...profile, displayName: ' Alex ' })).toEqual(
    profile,
  );
  expect(repository.saveProfile).toHaveBeenCalledWith('agent-1', profile);
});
it('validates raster file signatures and byte limits before persistence', async () => {
  for (const imageUrl of [
    'data:image/png;base64,SGVsbG8=',
    'data:image/jpeg;base64,iVBORw0KGgo=',
    'data:image/webp;base64,SGVsbG8=',
    'data:image/png;base64,' + Buffer.alloc(262145).toString('base64'),
  ]) {
    await expect(
      service.updateProfile('agent-1', { displayName: 'Alex', imageUrl }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  }
  expect(repository.saveProfile).not.toHaveBeenCalled();
});
it.each([
  ['png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
  ['jpeg', Buffer.from([255, 216, 255, 224])],
  ['webp', Buffer.from('RIFF0000WEBP')],
])('accepts a %s upload and supports removing it', async (type, bytes) => {
  await service.updateProfile('agent-1', {
    displayName: 'Alex',
    imageUrl: 'data:image/' + type + ';base64,' + bytes.toString('base64'),
  });
  await service.updateProfile('agent-1', { displayName: 'Alex', imageUrl: null });
  expect(repository.saveProfile).toHaveBeenLastCalledWith('agent-1', {
    displayName: 'Alex',
    imageUrl: null,
  });
});
