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
  'every root span created within a single `startNewTrace` callback shares the one new trace',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [pageloadEvent] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    const pageloadTraceId = pageloadEvent.contexts?.trace?.trace_id;
    expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);

    const transactionPromises = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
      page,
      3,
      { envelopeType: 'transaction' },
      eventAndTraceHeaderRequestParser,
    );

    await page.locator('#newTrace').click();

    const transactions = await transactionPromises;

    const byName = (name: string): EventAndTraceHeader => transactions.find(([event]) => event.transaction === name)!;

    const [span1] = byName('new-trace-span-1');
    const [span2] = byName('new-trace-span-2');
    const [span3] = byName('new-trace-span-3');

    const newTraceId = span1.contexts?.trace?.trace_id;
    expect(newTraceId).toMatch(/^[\da-f]{32}$/);

    // All three root spans share the one new trace id ...
    expect(span2.contexts?.trace?.trace_id).toBe(newTraceId);
    expect(span3.contexts?.trace?.trace_id).toBe(newTraceId);

    // ... which is a fresh trace, not the pageload trace.
    expect(newTraceId).not.toBe(pageloadTraceId);

    // They are independent root spans, not parented to one another.
    expect(span1.contexts?.trace).not.toHaveProperty('parent_span_id');
    expect(span2.contexts?.trace).not.toHaveProperty('parent_span_id');
    expect(span3.contexts?.trace).not.toHaveProperty('parent_span_id');
  },
);
