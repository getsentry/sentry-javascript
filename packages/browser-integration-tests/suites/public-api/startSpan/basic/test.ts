import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should send a transaction in an envelope', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transaction.transaction).toBe('parent_span');
  expect(transaction.spans).toBeDefined();
});

sentryTest('should report finished spans as children of the root transaction', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const rootSpanId = transaction?.contexts?.trace?.spanId;

  expect(transaction.spans).toHaveLength(1);

  const span_1 = transaction.spans?.[0];
  expect(span_1?.description).toBe('child_span');
  expect(span_1?.parentSpanId).toEqual(rootSpanId);
});
