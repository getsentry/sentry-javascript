import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import {
  type StreamedSpanAndTraceHeader,
  waitForStreamedSpanAndTraceHeader,
  waitForStreamedSpanAndTraceHeaderOnUrl,
} from '../../../../utils/spanUtils';

sentryTest(
  'every root span created within a single `startNewTrace` callback shares the one new trace',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [pageloadEvent] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
    const pageloadTraceId = pageloadEvent?.trace_id;
    expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);

    const spanPromises = Promise.all(
      [1, 2, 3].map(index => waitForStreamedSpanAndTraceHeader(page, span => span.name === `new-trace-span-${index}`)),
    );

    await page.locator('#newTrace').click();

    const spans = await spanPromises;

    const byName = (name: string): StreamedSpanAndTraceHeader => spans.find(([span]) => span.name === name)!;

    const [span1] = byName('new-trace-span-1');
    const [span2] = byName('new-trace-span-2');
    const [span3] = byName('new-trace-span-3');

    const newTraceId = span1.trace_id;
    expect(newTraceId).toMatch(/^[\da-f]{32}$/);

    // All three root spans share the one new trace id ...
    expect(span2.trace_id).toBe(newTraceId);
    expect(span3.trace_id).toBe(newTraceId);

    // ... which is a fresh trace, not the pageload trace.
    expect(newTraceId).not.toBe(pageloadTraceId);

    // They are independent root spans, not parented to one another.
    expect(span1).not.toHaveProperty('parent_span_id');
    expect(span2).not.toHaveProperty('parent_span_id');
    expect(span3).not.toHaveProperty('parent_span_id');
  },
);
