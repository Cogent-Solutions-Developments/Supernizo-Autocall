import { expect, test } from '@playwright/test';

const localAdminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;

test.describe('agent-to-visitor call signalling', () => {
  test.skip(
    !localAdminPassword,
    'Set E2E_LOCAL_ADMIN_PASSWORD to run the seeded database call flow.',
  );

  test('rings, accepts, cancels, then rejects across agent and visitor pages', async ({
    browser,
  }) => {
    const visitorContext = await browser.newContext();
    const agentContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    const agentPage = await agentContext.newPage();

    await visitorPage.goto('/sdk/fixture.html');
    await expect(visitorPage.getByTitle('Incoming calls')).toBeVisible();

    await agentPage.goto('/login');
    await agentPage.getByLabel('Email').fill('admin@local.test');
    await agentPage.getByLabel('Password').fill(localAdminPassword ?? '');
    await agentPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(agentPage.getByRole('heading', { name: 'Sites' })).toBeVisible();
    await agentPage.goto('/dashboard/live');
    await expect(agentPage.getByRole('button', { name: 'Audio Call' }).first()).toBeVisible({
      timeout: 10_000,
    });

    const visitorCall = visitorPage.frameLocator('iframe[title="Incoming calls"]');
    await agentPage.getByRole('button', { name: 'Audio Call' }).first().click();
    const agentCall = agentPage.getByRole('dialog', { name: /audio call/i });
    await expect(visitorCall.getByText('Incoming audio call')).toBeVisible({ timeout: 10_000 });
    await visitorCall.getByRole('button', { name: 'Accept' }).click();
    await expect(agentCall.getByText('ACCEPTED')).toBeVisible({ timeout: 10_000 });
    await agentCall.getByRole('button', { name: 'Cancel call' }).click();

    await agentCall.getByLabel('Close call').click();
    await agentPage.getByRole('button', { name: 'Video Call' }).first().click();
    const rejectCall = agentPage.getByRole('dialog', { name: /video call/i });
    await expect(visitorCall.getByText('Incoming video call')).toBeVisible({ timeout: 10_000 });
    await visitorCall.getByRole('button', { name: 'Decline' }).click();
    await expect(rejectCall.getByText('REJECTED')).toBeVisible({ timeout: 10_000 });

    await visitorContext.close();
    await agentContext.close();
  });
});
