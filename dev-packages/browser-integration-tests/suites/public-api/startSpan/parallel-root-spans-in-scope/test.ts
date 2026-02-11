import { expect } from '@playwright/test';
import type { TransactionEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should send manually started parallel root spans outside of root context',
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

    expect(trace1Id).toBeDefined();
    expect(trace2Id).toBeDefined();

    // We use the same traceID from the root propagation context here
    expect(trace1Id).toBe(trace2Id);

    expect(transaction1.contexts?.trace?.parent_span_id).toBeUndefined();
    expect(transaction2.contexts?.trace?.parent_span_id).toBeUndefined();
  },
);
