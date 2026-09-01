import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - middleware', () => {
  test('should send middleware span on pageload', async ({ page }) => {
    const serverSpansPromise = collectStreamedSpans(APP_NAME, spans => {
      return (
        spans.some(span => span.name === 'GET /performance/with-middleware' && span.is_segment) &&
        spans.some(span => span.name === 'authMiddleware')
      );
    });

    const pageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return span.name === '/performance/with-middleware' && getSpanOp(span) === 'pageload' && span.is_segment;
    });

    await page.goto(`/performance/with-middleware`);

    const serverSpans = await serverSpansPromise;
    const pageloadSpan = await pageloadSpanPromise;

    const serverSpan = serverSpans.find(span => span.name === 'GET /performance/with-middleware' && span.is_segment)!;
    const customMiddlewareSpan = serverSpans.find(span => span.name === 'authMiddleware')!;

    expect(pageloadSpan).toBeDefined();
    expect(customMiddlewareSpan).toBeDefined();

    // Assert that all spans belong to the same trace
    expect(serverSpan.trace_id).toBe(pageloadSpan.trace_id);
    expect(serverSpan.trace_id).toBe(customMiddlewareSpan.trace_id);
  });
});
