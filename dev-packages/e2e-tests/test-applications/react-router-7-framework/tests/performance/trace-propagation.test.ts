import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';
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
    // Streamed spans are buffered before they flush, so spans from an earlier page load can still be
    // arriving here. The document advertises its own trace in the `sentry-trace` meta tag, so that is
    // what tells this page load's spans apart rather than the op or the URL.
    const streamedSpans: SerializedStreamedSpan[] = [];
    void waitForStreamedSpans(APP_NAME, spans => {
      streamedSpans.push(...spans);
      return false;
    });

    await page.goto(`/`);

    const sentryTrace = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    const [traceId, handlerSpanId] = (sentryTrace ?? '').split('-');
    expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(handlerSpanId).toMatch(/^[a-f0-9]{16}$/);

    // The client continues the server trace, so its pageload span hangs off the span the meta tag
    // names. Selecting it that way, rather than by op, is what makes the trace assertion below mean
    // something: a pageload that failed to continue the trace would have no parent at all.
    const findClientSpan = () =>
      streamedSpans.find(
        span => getSpanOp(span) === 'pageload' && span.is_segment && span.parent_span_id === handlerSpanId,
      );
    await expect.poll(findClientSpan).toBeDefined();
    expect(findClientSpan()!.trace_id).toBe(traceId);

    const findServerSegmentSpan = () =>
      streamedSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment && span.trace_id === traceId);
    await expect.poll(findServerSegmentSpan).toBeDefined();

    const requestHandlerSpan = streamedSpans.find(span => span.span_id === handlerSpanId);
    expect(requestHandlerSpan).toBeDefined();
    expect(getSpanOp(requestHandlerSpan!)).toBe('handler');
    expect(requestHandlerSpan!.trace_id).toBe(traceId);
  });

  test('should not have trace connection for prerendered pages', async ({ page }) => {
    await page.goto('/performance/static');

    const sentryTraceElement = await page.$('meta[name="sentry-trace"]');
    expect(sentryTraceElement).toBeNull();
  });
});
