import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-5';

test.describe('tracing in static/pre-rendered routes', () => {
  test('only sends client pageload span with traceId from pre-rendered <meta> tags', async ({ page }) => {
    const streamedSpans: SerializedStreamedSpan[] = [];
    void waitForStreamedSpans(APP_NAME, spans => {
      streamedSpans.push(...spans);
      return false;
    });

    const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
      return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/test-static';
    });

    await page.goto('/test-static');

    const clientPageloadSpan = await clientPageloadSpanPromise;

    const sentryTraceMetaTags = await page.locator('meta[name="sentry-trace"]').count();
    expect(sentryTraceMetaTags).toBe(0);

    const baggageMetaTags = await page.locator('meta[name="baggage"]').count();
    expect(baggageMetaTags).toBe(0);

    expect(clientPageloadSpan.trace_id).toMatch(/[a-f0-9]{32}/);
    expect(clientPageloadSpan.parent_span_id).toBeUndefined();

    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.template': { value: '/test-static', type: 'string' },
      'url.path': { value: '/test-static', type: 'string' },
      'url.full': { value: expect.stringMatching(/^https?:\/\/localhost:\d+\/test-static$/), type: 'string' },
    });

    await page.waitForTimeout(1000); // wait another sec to ensure no server span is sent

    // The route is pre-rendered, so the request never reaches the SSR middleware and no server span
    // exists for it.
    expect(
      streamedSpans.filter(
        span =>
          getSpanOp(span) === 'http.server' && String(span.attributes['url.path']?.value).startsWith('/test-static'),
      ),
    ).toEqual([]);
  });
});
