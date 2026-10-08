import { expect, test } from '@playwright/test';
import {
  ChatThreadSchema,
  ChatFollowUpSchema,
  TrackerBootstrapResponseSchema,
} from '../../packages/shared/src/index';
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || !(key in value))
    throw new Error('Missing response field: ' + key);
  return Reflect.get(value, key);
}
const localAdminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;
test('a visitor can opt into follow-up and authorized staff can use the saved details', async ({
  browser,
}) => {
  test.skip(!localAdminPassword, 'Run through pnpm test:e2e:local with the local seeded account.');
  test.setTimeout(120_000);
  const visitorContext = await browser.newContext();
  const staffContext = await browser.newContext();
  {
    const visitor = await visitorContext.newPage();
    visitor.setDefaultTimeout(15_000);
    const bootstrapResponse = visitor.waitForResponse(
      (response) =>
        response.url().endsWith('/api/track/bootstrap') && response.request().method() === 'POST',
    );
    await visitor.goto('/autocall-db/sdk/fixture.html');
    const bootstrap = TrackerBootstrapResponseSchema.parse(await (await bootstrapResponse).json());
    await visitor.getByRole('button', { name: 'Open chat with the event team' }).click();
    const frame = visitor.frameLocator('iframe[title="Website chat"]');
    const leaveDetails = frame.getByRole('button', {
      name: 'Leave contact details for a reply later',
    });
    const form = frame.getByRole('form', { name: 'Contact details for follow-up' });
    await expect(form.or(leaveDetails)).toBeVisible({ timeout: 30_000 });
    if (await leaveDetails.isVisible()) await leaveDetails.click();
    await expect(form).toBeVisible();
    const dialog = frame.getByRole('dialog', { name: /Let’s keep/ });
    await expect(dialog).toBeVisible();
    await expect(form.locator('input:not([type=checkbox])')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close contact form' }).click();
    await expect(dialog).not.toBeVisible();
    await leaveDetails.click();
    await expect(dialog).toBeVisible();
    await form.getByLabel('Email address').fill('followup@example.com');
    await form.getByLabel('WhatsApp number').fill('+94 77 123 4567');
    const consent = form.getByRole('checkbox');
    await expect(consent).not.toBeChecked();
    await consent.check();
    const savedResponse = visitor.waitForResponse(
      (response) =>
        response.url().endsWith('/api/chat/visitor/contact') &&
        response.request().method() === 'POST',
    );
    await form.getByRole('button', { name: 'Save contact details' }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ data: { saved: true } });
    await expect(frame.getByText(/contact details (have been )?saved/i).first()).toBeVisible();
    const query = new URLSearchParams({
      sitePublicKey: 'site_demo_local',
      sessionId: bootstrap.sessionId,
      visitorId: bootstrap.visitorId,
    });
    const response = await visitor.request.get('/autocall-db/api/chat/visitor/thread?' + query, {
      headers: { origin: 'http://localhost:3001' },
    });
    const thread = ChatThreadSchema.parse(field(field(await response.json(), 'data'), 'thread'));
    const privateUrl = '/autocall-db/api/chat/threads/' + thread.id + '/follow-up';
    expect((await visitor.request.get(privateUrl)).status()).toBe(401);
    const staff = await staffContext.newPage();
    const csrfResponse = await staff.request.get('/autocall-db/api/auth/csrf');
    const csrfToken = field(await csrfResponse.json(), 'csrfToken');
    if (typeof csrfToken !== 'string') throw new Error('Missing login CSRF token');
    const signInResponse = await staff.request.post('/autocall-db/api/auth/callback/credentials', {
      form: {
        csrfToken,
        email: 'admin@local.test',
        password: localAdminPassword ?? '',
        json: 'true',
        callbackUrl: 'http://localhost:3001/autocall-db/dashboard',
      },
    });
    expect(signInResponse.status()).toBe(200);
    const detailsResponse = await staff.request.get(privateUrl);
    expect(detailsResponse.status()).toBe(200);
    const details = ChatFollowUpSchema.parse(field(await detailsResponse.json(), 'data'));
    expect(details.contact).toMatchObject({
      channel: 'BOTH',
      email: 'followup@example.com',
      whatsapp: '+94771234567',
      consentVersion: 'conversation-follow-up-v1',
    });
    expect(details.status).toBe('NEEDS_REPLY');
    const updated = await staff.request.patch(privateUrl, {
      data: { status: 'FOLLOW_UP_PENDING' },
    });
    expect(updated.status()).toBe(200);
    expect(ChatFollowUpSchema.parse(field(await updated.json(), 'data')).status).toBe(
      'FOLLOW_UP_PENDING',
    );
    await visitor.reload();
    await visitor.getByRole('button', { name: 'Open chat with the event team' }).click();
    await expect(
      visitor.frameLocator('iframe[title="Website chat"]').getByText(/Contact details saved/),
    ).toBeVisible({ timeout: 15_000 });
    for (const contact of [
      { email: 'only-email@example.com', whatsapp: '', channel: 'EMAIL' },
      { email: '', whatsapp: '+94771234567', channel: 'WHATSAPP' },
    ]) {
      await frame.getByRole('button', { name: 'Update details' }).click();
      await form.getByLabel('Email address').fill(contact.email);
      await form.getByLabel('WhatsApp number').fill(contact.whatsapp);
      await form.getByRole('checkbox').check();
      const response = visitor.waitForResponse(
        (r) => r.url().endsWith('/api/chat/visitor/contact') && r.request().method() === 'POST',
      );
      await form.getByRole('button', { name: 'Save contact details' }).click();
      expect((await response).status()).toBe(200);
      await expect(frame.getByRole('dialog')).not.toBeVisible();
      const updatedContact = ChatFollowUpSchema.parse(
        field(await (await staff.request.get(privateUrl)).json(), 'data'),
      );
      expect(updatedContact.contact?.channel).toBe(contact.channel);
      expect(updatedContact.contact?.email).toBe(contact.email || null);
      expect(updatedContact.contact?.whatsapp).toBe(contact.whatsapp || null);
    }
  }
});
