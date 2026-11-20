import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, getEnvelopeType, testingCdnBundle } from '../../../utils/helpers';

sentryTest.beforeEach(() => {
  // CDN bundles lazy load the feedback modal through a `script.src` sink, which needs a Trusted Types policy.
  sentryTest.skip(testingCdnBundle());
});

sentryTest('renders the feedback form without Trusted Types violations', async ({ getLocalTestUrl, page }) => {
  const feedbackRequestPromise = page.waitForRequest(req => {
    try {
      return getEnvelopeType(req) === 'feedback';
    } catch {
      return false;
    }
  });

  await page.goto(await getLocalTestUrl({ testDir: __dirname }));
  await page.getByText('Report a Bug').click();

  await expect(page.locator('.brand-link svg')).toBeVisible();

  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  expect(envelopeRequestParser(await feedbackRequestPromise).contexts?.feedback?.message).toBe('my example feedback');
  await expect(page.locator('.success__icon svg')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__TRUSTED_TYPES_VIOLATIONS__)).toEqual([]);
});

sentryTest(
  'renders the screenshot editor without Trusted Types violations',
  async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(browserName !== 'chromium', 'The canvas screen-capture fixture requires Chromium.');

    await page.addInitScript(() => {
      // The fixture runs over HTTP, but screenshot capture is stubbed below.
      Object.defineProperty(window, 'isSecureContext', { value: true });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getDisplayMedia: async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return canvas.captureStream();
          },
        },
        configurable: true,
      });
    });

    await page.goto(await getLocalTestUrl({ testDir: __dirname }));
    await page.getByRole('button', { name: 'Report a Bug', exact: true }).click();
    await page.getByRole('button', { name: 'Add a screenshot', exact: true }).click();

    await expect(page.locator('.editor__image-container')).toHaveCSS('padding', '15px');
    expect(await page.evaluate(() => (window as any).__TRUSTED_TYPES_VIOLATIONS__)).toEqual([]);
  },
);
