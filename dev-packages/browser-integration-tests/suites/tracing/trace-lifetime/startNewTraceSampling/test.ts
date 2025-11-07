import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
  waitForTransactionRequest,
} from '../../../../utils/helpers';

sentryTest(
  'new trace started with `startNewTrace` is sampled according to the `tracesSampler`',
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
      data: {
        'sentry.sample_rate': 0.5,
      },
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '0.5',
      sampled: 'true',
      trace_id: pageloadTraceContext?.trace_id,
      sample_rand: '0.45',
    });

    const transactionPromise = waitForTransactionRequest(page, event => {
      return event.transaction === 'new-trace';
    });

    await page.locator('#newTrace').click();

    const [newTraceTransactionEvent, newTraceTransactionTraceHeaders] = eventAndTraceHeaderRequestParser(
      await transactionPromise,
    );

    const newTraceTransactionTraceContext = newTraceTransactionEvent.contexts?.trace;
    expect(newTraceTransactionTraceContext).toMatchObject({
      op: 'ui.interaction.click',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
      data: {
        'sentry.sample_rate': 0.9,
      },
    });

    expect(newTraceTransactionTraceHeaders).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '0.9',
      sampled: 'true',
      trace_id: newTraceTransactionTraceContext?.trace_id,
      transaction: 'new-trace',
      sample_rand: '0.85',
    });

    expect(newTraceTransactionTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
  },
);
