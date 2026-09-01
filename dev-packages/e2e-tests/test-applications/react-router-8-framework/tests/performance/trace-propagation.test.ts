import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('Trace propagation', () => {
  test('should inject metatags in ssr pageload', async ({ page }) => {
    await page.goto(`/`);
    const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    expect(sentryTraceContent).toBeDefined();
    expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);
    const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
    expect(baggageContent).toBeDefined();
    expect(baggageContent).toContain('sentry-environment=qa');
    expect(baggageContent).toContain('sentry-public_key=');
    expect(baggageContent).toContain('sentry-trace_id=');
    expect(baggageContent).toContain('sentry-transaction=');
    expect(baggageContent).toContain('sentry-sampled=');
  });

  test('should have trace connection', async ({ page }) => {
    // The `handler` child span arrives in the same envelope as its server segment, so collect until
    // the segment shows up rather than snapshotting a single envelope.
    const serverSpansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => getSpanOp(span) === 'http.server' && span.is_segment);
    });

    const clientSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/`);
    const serverSpans = await serverSpansPromise;
    const clientSpan = await clientSpanPromise;

    const serverSegmentSpan = serverSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment)!;

    expect(clientSpan.trace_id).toEqual(serverSegmentSpan.trace_id);

    const requestHandlerSpan = serverSpans.find(span => getSpanOp(span) === 'handler');

    expect(requestHandlerSpan).toBeDefined();
    expect(clientSpan.parent_span_id).toBe(requestHandlerSpan?.span_id);
  });

  test('should not have trace connection for prerendered pages', async ({ page }) => {
    await page.goto('/performance/static');

    const sentryTraceElement = await page.$('meta[name="sentry-trace"]');
    expect(sentryTraceElement).toBeNull();
  });
});
