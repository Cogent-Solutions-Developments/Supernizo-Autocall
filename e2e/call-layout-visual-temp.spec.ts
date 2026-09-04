import { expect, test, type Page } from '@playwright/test';

type CallType = 'AUDIO' | 'VIDEO';

test.use({
  launchOptions: {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  },
});

async function showConnectedCall(page: Page, type: CallType): Promise<void> {
  const origin = 'http://127.0.0.1:3001';
  await page.goto(`${origin}/widget/call?host_origin=${encodeURIComponent(origin)}`);
  await page.evaluate(
    ({ callType, targetOrigin }) => {
      window.postMessage(
        {
          config: {
            channel: 'visual-check',
            livekitUrl: 'wss://127.0.0.1:65534',
            token: 'visual-check-token',
          },
          type: 'supernizo-call-config',
        },
        targetOrigin,
      );
      window.postMessage(
        {
          call: {
            agentAvatarUrl: null,
            agentDisplayName: 'Soniya Sahanya',
            id: `visual-${callType.toLowerCase()}`,
            requestedAt: '2026-09-04T06:30:00.000Z',
            roomName: `visual-${callType.toLowerCase()}`,
            siteId: 'visual-site',
            status: 'ACCEPTED',
            type: callType,
            visitorId: 'visual-visitor',
          },
          type: 'supernizo-call-status',
        },
        targetOrigin,
      );
    },
    { callType: type, targetOrigin: origin },
  );
  await page.getByRole('heading', { name: 'Call connected' }).waitFor();
  await page.evaluate((targetOrigin) => {
    window.postMessage(
      {
        callId: 'visual-' + (window.innerHeight > 300 ? 'video' : 'audio'),
        media: { token: 'visual-media-token', url: 'wss://127.0.0.1:65534' },
        type: 'supernizo-call-media',
      },
      targetOrigin,
    );
  }, origin);
  await page.getByRole('button', { name: 'End call' }).waitFor();
}

for (const layout of [
  { height: 488, name: 'video', type: 'VIDEO' as const },
  { height: 240, name: 'audio', type: 'AUDIO' as const },
]) {
  test(`connected ${layout.name} call fits its compact card`, async ({ page }) => {
    await page.setViewportSize({ height: layout.height, width: 350 });
    await showConnectedCall(page, layout.type);

    const measurements = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('section[aria-label="Official event call"]');
      const controls = document.querySelector<HTMLElement>('.media-controls');
      const footer = document.querySelector<HTMLElement>('.call-card__footer');
      if (!card || !controls || !footer) throw new Error('Connected call layout is incomplete.');
      const cardRect = card.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        bodyScrollHeight: document.body.scrollHeight,
        cardBottom: cardRect.bottom,
        cardHeight: cardRect.height,
        controlsToFooter: footerRect.top - controlsRect.bottom,
        footerBottomGap: cardRect.bottom - footerRect.bottom,
      };
    });

    expect(measurements.bodyScrollHeight).toBeLessThanOrEqual(layout.height);
    expect(measurements.cardHeight).toBe(layout.height - 2);
    expect(measurements.controlsToFooter).toBeLessThanOrEqual(24);
    expect(measurements.footerBottomGap).toBeLessThanOrEqual(1);
    expect(
      await page.locator('[data-nextjs-dialog], .vite-error-overlay').count(),
    ).toBe(0);
    await page.screenshot({ path: `/private/tmp/connected-${layout.name}-compact.png` });
  });
}
