import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest('sends an empty string attribute', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForTransactionRequestOnUrl(page, url);
  const transaction = envelopeRequestParser(req);

  const childSpan = transaction.spans?.[0];
  expect(childSpan?.data?.someAttribute).toBe('');
});
