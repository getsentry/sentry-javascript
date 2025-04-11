import { expect } from '@playwright/test';
import type { TransactionEvent } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../utils/helpers';

sentryTest('should link spans by adding "links" to span options', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const rootSpan1Promise = waitForTransactionRequest(page, event => event.transaction === 'rootSpan1');
  const rootSpan2Promise = waitForTransactionRequest(page, event => event.transaction === 'rootSpan2');
  const rootSpan3Promise = waitForTransactionRequest(page, event => event.transaction === 'rootSpan3');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const rootSpan1 = envelopeRequestParser<TransactionEvent>(await rootSpan1Promise);
  const rootSpan2 = envelopeRequestParser<TransactionEvent>(await rootSpan2Promise);
  const rootSpan3 = envelopeRequestParser<TransactionEvent>(await rootSpan3Promise);

  const rootSpan1_traceId = rootSpan1.contexts?.trace?.trace_id as string;
  const rootSpan1_spanId = rootSpan1.contexts?.trace?.span_id as string;
  const rootSpan2_traceId = rootSpan2.contexts?.trace?.trace_id as string;
  const rootSpan2_spanId = rootSpan2.contexts?.trace?.span_id as string;

  expect(rootSpan1.transaction).toBe('rootSpan1');
  expect(rootSpan1.spans).toEqual([]);

  expect(rootSpan3.transaction).toBe('rootSpan3');
  expect(rootSpan3.spans?.length).toBe(1);
  expect(rootSpan3.spans?.[0].description).toBe('childSpan3.1');

  expect(rootSpan3.contexts?.trace?.links?.length).toBe(2);
  expect(rootSpan3.contexts?.trace?.links).toEqual([
    {
      sampled: true,
      span_id: rootSpan1_spanId,
      trace_id: rootSpan1_traceId,
    },
    {
      attributes: { 'sentry.link.type': 'previous_trace' },
      sampled: true,
      span_id: rootSpan2_spanId,
      trace_id: rootSpan2_traceId,
    },
  ]);
});
