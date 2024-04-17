import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequestOnUrl } from '../../../utils/helpers';

sentryTest('parses a string sample rate', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.contexts?.trace?.data?.['sentry.sample_rate']).toStrictEqual(1);
});
