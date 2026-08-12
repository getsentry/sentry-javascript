import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequestOnUrl } from '../../../../utils/helpers';

sentryTest('tracesSampler can sample based on the `sentry.op` attribute', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // The sampler drops `other.op` and keeps `custom.op`, so the only transaction
  // that arrives is the one whose op the sampler saw in the attributes.
  const req = await waitForTransactionRequestOnUrl(page, url);
  const transactionEvent = envelopeRequestParser(req);

  expect(transactionEvent.type).toBe('transaction');
  expect(transactionEvent.transaction).toBe('span-with-sampled-op');
  expect(transactionEvent.contexts?.trace?.op).toBe('custom.op');
});
