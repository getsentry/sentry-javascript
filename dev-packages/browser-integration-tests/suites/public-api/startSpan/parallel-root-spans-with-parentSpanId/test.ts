import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'should send manually started parallel root spans in root context with parentSpanId',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const transaction1ReqPromise = waitForStreamedSpan(page, event => event.name === 'test_span_1');
    const transaction2ReqPromise = waitForStreamedSpan(page, event => event.name === 'test_span_2');

    await page.goto(url);

    const [transaction1Req, transaction2Req] = await Promise.all([transaction1ReqPromise, transaction2ReqPromise]);

    const transaction1 = transaction1Req;
    const transaction2 = transaction2Req;

    expect(transaction1).toBeDefined();
    expect(transaction2).toBeDefined();

    const trace1Id = transaction1.trace_id;
    const trace2Id = transaction2.trace_id;

    expect(trace1Id).toBe('12345678901234567890123456789012');
    expect(trace2Id).toBe('12345678901234567890123456789012');

    expect(transaction1.parent_span_id).toBe('1234567890123456');
    expect(transaction2.parent_span_id).toBe('1234567890123456');
  },
);
