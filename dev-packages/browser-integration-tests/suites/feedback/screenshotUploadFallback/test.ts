import { expect } from '@playwright/test';
import { parseEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipFeedbackTest } from '../../../utils/helpers';

sentryTest('uploads an image after display capture is rejected', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeedbackTest()) {
    sentryTest.skip();
  }

  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')),
      },
    });
  });

  const feedbackRequestPromise = page.waitForResponse(response => {
    return response.url().includes('/envelope/');
  });
  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  await page.goto(url);
  await page.getByText('Report a Bug').click();
  await page.getByRole('button', { name: 'Add a screenshot' }).click();

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeVisible();
  await fileInput.setInputFiles({
    name: 'bug.png',
    mimeType: 'image/png',
    buffer: Buffer.from('manual screenshot'),
  });
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('Screenshot capture is blocked');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const request = (await feedbackRequestPromise).request();
  const items = parseEnvelope(request.postDataBuffer()!)[1];
  const attachment = items.find(([header]) => header.type === 'attachment');

  expect(attachment?.[0]).toEqual({
    type: 'attachment',
    length: 17,
    filename: 'bug.png',
    content_type: 'image/png',
  });
  expect(new TextDecoder().decode(attachment?.[1] as Uint8Array)).toBe('manual screenshot');
});
