import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('tracesSampler can sample based on the `sentry.op` attribute', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // The sampler drops `other.op` and keeps `custom.op`, so the only transaction
  // that arrives is the one whose op the sampler saw in the attributes.
  const transactionEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transactionEvent.type).toBe('transaction');
  expect(transactionEvent.transaction).toBe('span-with-sampled-op');
  expect(transactionEvent.contexts?.trace?.op).toBe('custom.op');
});
