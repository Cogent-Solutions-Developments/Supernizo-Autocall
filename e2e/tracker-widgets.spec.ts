import { expect, test } from '@playwright/test';

test('the tracker fixture mounts chat and call widget iframes', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/autocall-db/sdk/fixture.html');
  await expect(page.locator('iframe[title="Website chat"]')).toHaveCount(1);
  await expect(page.locator('iframe[title="Incoming calls"]')).toHaveCount(1);
  await expect(
    page.frameLocator('iframe[title="Website chat"]').getByRole('button', { name: 'Open chat' }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});
