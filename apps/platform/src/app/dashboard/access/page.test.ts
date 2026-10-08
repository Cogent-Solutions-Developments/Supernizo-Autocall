import { expect, it, vi } from 'vitest';
import { requireDashboardUser } from '@/server/interfaces/auth/access';
import AccessManagementPage from './page';
vi.mock('@/server/interfaces/auth/access', () => ({ requireDashboardUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('redirect:' + path);
  },
}));
it('sends old assignment bookmarks to Events without duplicating the base path', async () => {
  await expect(AccessManagementPage()).rejects.toThrow('redirect:/dashboard');
  expect(requireDashboardUser).toHaveBeenCalled();
});
