import { expect } from '@playwright/test';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/browser';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest(
  'sends a transaction in an envelope with manual origin and custom source',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    const req = await waitForTransactionRequestOnUrl(page, url);
    const transaction = envelopeRequestParser(req);

    const attributes = transaction.contexts?.trace?.data;
    expect(attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
      [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    });

    expect(transaction.transaction_info?.source).toBe('custom');

    expect(transaction.transaction).toBe('parent_span');
    expect(transaction.spans).toBeDefined();
  },
);

sentryTest('should report finished spans as children of the root transaction', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForTransactionRequestOnUrl(page, url);
  const transaction = envelopeRequestParser(req);

  expect(transaction.spans).toHaveLength(1);

  const span_1 = transaction.spans?.[0];
  expect(span_1?.description).toBe('child_span');
  expect(span_1?.parent_span_id).toEqual(transaction?.contexts?.trace?.span_id);
  expect(span_1?.origin).toEqual('manual');
  expect(span_1?.data?.['sentry.origin']).toEqual('manual');
});
