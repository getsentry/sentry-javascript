import { expect } from '@playwright/test';
import type { TransactionEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should send manually started parallel root spans in root context with parentSpanId',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const transaction1ReqPromise = waitForTransactionRequest(page, event => event.transaction === 'test_span_1');
    const transaction2ReqPromise = waitForTransactionRequest(page, event => event.transaction === 'test_span_2');

    await page.goto(url);

    const [transaction1Req, transaction2Req] = await Promise.all([transaction1ReqPromise, transaction2ReqPromise]);

    const transaction1 = envelopeRequestParser<TransactionEvent>(transaction1Req);
    const transaction2 = envelopeRequestParser<TransactionEvent>(transaction2Req);

    expect(transaction1).toBeDefined();
    expect(transaction2).toBeDefined();

    const trace1Id = transaction1.contexts?.trace?.trace_id;
    const trace2Id = transaction2.contexts?.trace?.trace_id;

    expect(trace1Id).toBe('12345678901234567890123456789012');
    expect(trace2Id).toBe('12345678901234567890123456789012');

    expect(transaction1.contexts?.trace?.parent_span_id).toBe('1234567890123456');
    expect(transaction2.contexts?.trace?.parent_span_id).toBe('1234567890123456');
  },
);
