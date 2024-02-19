import { expect } from '@playwright/test';
import type { SerializedEvent } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should report a transaction in an envelope', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<SerializedEvent>(page, url);

  expect(transaction.transaction).toBe('root_span');
  expect(transaction.spans).toBeDefined();
});

sentryTest('should report finished spans as children of the root span', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const transaction = await getFirstSentryEnvelopeRequest<SerializedEvent>(page, url);

  const rootSpanId = transaction?.contexts?.trace?.span_id;

  expect(transaction).toBe(1);

  expect(transaction.spans).toHaveLength(3);

  const span_1 = transaction.spans?.[0];

  expect(span_1).toBeDefined();
  expect(span_1!.op).toBe('span_1');
  expect(span_1!.parent_span_id).toEqual(rootSpanId);
  expect(span_1!.data).toMatchObject({ foo: 'bar', baz: [1, 2, 3] });

  const span_3 = transaction.spans?.[1];
  expect(span_3).toBeDefined();
  expect(span_3!.op).toBe('span_3');
  expect(span_3!.parent_span_id).toEqual(rootSpanId);

  const span_5 = transaction.spans?.[2];
  expect(span_5).toBeDefined();
  expect(span_5!.op).toBe('span_5');
  expect(span_5!.parent_span_id).toEqual(span_3!.span_id);
});
