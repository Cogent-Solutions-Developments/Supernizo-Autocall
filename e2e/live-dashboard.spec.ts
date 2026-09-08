import { expect, test } from '@playwright/test';

test.describe('live visitor dashboard', () => {
  test('redirects an unauthenticated dashboard request to login', async ({ page }) => {
    await page.goto('/dashboard/live');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  });
});
