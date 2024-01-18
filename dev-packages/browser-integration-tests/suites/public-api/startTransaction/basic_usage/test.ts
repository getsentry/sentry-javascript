import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should report a transaction in an envelope', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(transaction.transaction).toBe('test_transaction_1');
  expect(transaction.spans).toBeDefined();
});

sentryTest('should report finished spans as children of the root transaction', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const rootSpanId = transaction?.contexts?.trace?.span_id;

  expect(transaction.spans).toHaveLength(3);

  const span_1 = transaction.spans?.[0];

  // eslint-disable-next-line deprecation/deprecation
  expect(span_1?.op).toBe('span_1');
  // @ts-expect-error this property is not defined on the incorrectly used Event
  expect(span_1?.parent_span_id).toEqual(rootSpanId);
  // eslint-disable-next-line deprecation/deprecation
  expect(span_1?.data).toMatchObject({ foo: 'bar', baz: [1, 2, 3] });

  const span_3 = transaction.spans?.[1];
  // eslint-disable-next-line deprecation/deprecation
  expect(span_3?.op).toBe('span_3');
  // @ts-expect-error this property is not defined on the incorrectly used Event
  expect(span_3?.parent_span_id).toEqual(rootSpanId);

  const span_5 = transaction.spans?.[2];
  // eslint-disable-next-line deprecation/deprecation
  expect(span_5?.op).toBe('span_5');
  // @ts-expect-error this property is not defined on the incorrectly used Event
  expect(span_5?.parent_span_id).toEqual(span_3?.span_id);
});
