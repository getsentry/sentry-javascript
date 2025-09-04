import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('should capture a simple error with message', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'test_simple_error',
    mechanism: {
      type: 'generic',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});

sentryTest('should capture correct SDK metadata', async ({ getLocalTestUrl, page }) => {
  const isCdn = (process.env.PW_BUNDLE || '').startsWith('bundle');

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.sdk).toEqual({
    name: 'sentry.javascript.browser',
    version: SDK_VERSION,
    integrations: expect.any(Object),
    packages: [
      {
        name: `${isCdn ? 'cdn' : 'npm'}:@sentry/browser`,
        version: SDK_VERSION,
      },
    ],
    settings: {
      infer_ip: 'never',
    },
  });
});
