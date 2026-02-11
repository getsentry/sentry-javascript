import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('captureException works', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.message).toBe('Test exception');
});

sentryTest('should capture correct SDK metadata', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.sdk).toMatchObject({
    name: 'sentry.javascript.browser',
    version: SDK_VERSION,
    integrations: expect.any(Object),
    packages: [
      {
        name: 'loader:@sentry/browser',
        version: SDK_VERSION,
      },
    ],
  });
});
