import { expect, test } from '@playwright/test';

test.describe('live visitor dashboard', () => {
  test('redirects an unauthenticated dashboard request to login', async ({ page }) => {
    await page.goto('/autocall-db/dashboard/live');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });
});

const localAdminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;

test('the seeded local administrator can sign in and read sites', async ({ page }) => {
  test.skip(!localAdminPassword, 'Set E2E_LOCAL_ADMIN_PASSWORD using pnpm test:e2e:local.');
  await page.goto('/autocall-db/login');
  await page.getByLabel('Email address', { exact: true }).fill('admin@local.test');
  await page.locator('input[name="password"]').fill(localAdminPassword ?? '');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/autocall-db\/dashboard(?:\/.*)?$/);
  const response = await page.request.get('/autocall-db/api/dashboard/sites');
  expect(response.status()).toBe(200);
});
