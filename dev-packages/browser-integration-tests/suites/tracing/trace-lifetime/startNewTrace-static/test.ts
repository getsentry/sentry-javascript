import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'creates a new trace if `startNewTrace` is called and leaves old trace valid outside the callback',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const [pageloadEvent, pageloadTraceHeaders] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );

    const pageloadTraceContext = pageloadEvent.contexts?.trace;

    expect(pageloadEvent.type).toEqual('transaction');

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: pageloadTraceContext?.trace_id,
      sample_rand: expect.any(String),
    });

    const transactionPromises = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
      page,
      2,
      { envelopeType: 'transaction' },
      eventAndTraceHeaderRequestParser,
    );

    await page.locator('#newTrace').click();
    await page.locator('#oldTrace').click();

    const [txnEvent1, txnEvent2] = await transactionPromises;

    const [newTraceTransactionEvent, newTraceTransactionTraceHeaders] =
      txnEvent1[0].transaction === 'new-trace' ? txnEvent1 : txnEvent2;
    const [oldTraceTransactionEvent, oldTraceTransactionTraceHeaders] =
      txnEvent1[0].transaction === 'old-trace' ? txnEvent1 : txnEvent2;

    const newTraceTransactionTraceContext = newTraceTransactionEvent.contexts?.trace;
    expect(newTraceTransactionTraceContext).toMatchObject({
      op: 'ui.interaction.click',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(newTraceTransactionTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: newTraceTransactionTraceContext?.trace_id,
      transaction: 'new-trace',
      sample_rand: expect.any(String),
    });

    const oldTraceTransactionEventTraceContext = oldTraceTransactionEvent.contexts?.trace;
    expect(oldTraceTransactionEventTraceContext).toMatchObject({
      op: 'ui.interaction.click',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(oldTraceTransactionTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: oldTraceTransactionTraceHeaders?.trace_id,
      sample_rand: expect.any(String),
      // transaction: 'old-trace', <-- this is not in the DSC because the DSC is continued from the pageload transaction
      // which does not have a `transaction` field because its source is URL.
    });

    expect(oldTraceTransactionEventTraceContext?.trace_id).toEqual(pageloadTraceContext?.trace_id);
    expect(newTraceTransactionTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
  },
);
