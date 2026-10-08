import { expect, test } from '@playwright/test';

const localAdminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;

test.describe('agent and visitor website chat', () => {
  test.skip(
    !localAdminPassword,
    'Set E2E_LOCAL_ADMIN_PASSWORD to run the seeded database chat flow.',
  );

  test('keeps the agent dashboard and tracked visitor in separate browser contexts', async ({
    browser,
  }) => {
    const visitorContext = await browser.newContext();
    const agentContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    const agentPage = await agentContext.newPage();

    await visitorPage.goto('/autocall-db/sdk/fixture.html');
    await visitorPage.getByRole('button', { name: 'Open chat with the event team' }).click();
    await expect(visitorPage.getByTitle('Website chat')).toBeVisible();

    await agentPage.goto('/autocall-db/login');
    await agentPage.getByLabel('Email').fill('admin@local.test');
    await agentPage.locator('input[name="password"]').fill(localAdminPassword ?? '');
    await agentPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(agentPage).toHaveURL(/\/autocall-db\/dashboard(?:\/.*)?$/);
    await agentPage.goto('/autocall-db/dashboard/live');
    await expect(agentPage.getByRole('heading', { name: 'Live visitors' })).toBeVisible();

    const visitorChat = visitorPage.frameLocator('iframe[title="Website chat"]');
    await expect(visitorChat.getByLabel('Message')).toBeEnabled({ timeout: 10_000 });
    await visitorChat.getByLabel('Message').fill('Hello from the visitor website');
    await visitorChat.getByRole('button', { name: 'Send' }).click();

    await agentPage.getByRole('button', { name: 'Chat' }).first().click();
    const agentChat = agentPage.getByRole('dialog', { name: /live chat/i });
    await expect(agentChat.getByText('Hello from the visitor website')).toBeVisible({
      timeout: 10_000,
    });
    await agentChat.getByLabel('Message').fill('Hello from the dashboard');
    await agentChat.getByRole('button', { name: 'Send' }).click();
    await expect(visitorChat.getByText('Hello from the dashboard')).toBeVisible({
      timeout: 10_000,
    });

    await visitorContext.close();
    await agentContext.close();
  });
});
