import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../utils/helpers';

sentryTest('allows to use pluggable integrations from @sentry/browser', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;

  // Only run this for import-based tests, not CDN bundles/loader
  if (bundle && bundle.startsWith('bundle_')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        TypeError: {
          baz: 42,
          foo: 'bar',
        },
      }),
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'foo',
            mechanism: {
              type: 'generic',
              handled: true,
            },
            stacktrace: {
              frames: expect.any(Array),
            },
          },
        ],
      },
    }),
  );
});
