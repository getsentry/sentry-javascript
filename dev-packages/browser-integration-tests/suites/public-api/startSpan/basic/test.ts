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

  const rootSpanId = transaction?.contexts?.trace?.span_id;

  expect(transaction.spans).toHaveLength(1);

  const span_1 = transaction.spans?.[0];
  // eslint-disable-next-line deprecation/deprecation
  expect(span_1?.description).toBe('child_span');
  // @ts-expect-error this property is not defined on Event. But in fact, `parent_span_id` is correct here
  expect(span_1?.parent_span_id).toEqual(rootSpanId);
});
