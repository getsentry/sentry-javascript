import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should report a transaction in an envelope', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transaction.transaction).toBe('test_transaction_1');
  expect(transaction.spans).toBeDefined();
});

sentryTest('should report finished spans as children of the root transaction', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const rootSpanId = transaction?.contexts?.trace?.spanId;

  expect(transaction.spans).toHaveLength(3);

  const span_1 = transaction.spans?.[0];
  expect(span_1?.op).toBe('span_1');
  expect(span_1?.parentSpanId).toEqual(rootSpanId);
  expect(span_1?.data).toMatchObject({ foo: 'bar', baz: [1, 2, 3] });

  const span_3 = transaction.spans?.[1];
  expect(span_3?.op).toBe('span_3');
  expect(span_3?.parentSpanId).toEqual(rootSpanId);

  const span_5 = transaction.spans?.[2];
  expect(span_5?.op).toBe('span_5');
  expect(span_5?.parentSpanId).toEqual(span_3?.spanId);
});
