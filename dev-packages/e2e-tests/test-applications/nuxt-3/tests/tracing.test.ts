import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.describe('distributed tracing', () => {
  const PARAM = 's0me-param';

  test('capture a distributed pageload trace', async ({ page }) => {
    const clientSpanPromise = waitForStreamedSpan('nuxt-3', span => {
      return getSpanOp(span) === 'pageload' && span.is_segment;
    });

    const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
      return span.is_segment && span.name.includes('GET /test-param/');
    });

    const [_, clientSpan, serverSpan] = await Promise.all([
      page.goto(`/test-param/${PARAM}`),
      clientSpanPromise,
      serverSpanPromise,
      expect(page.getByText(`Param: ${PARAM}`)).toBeVisible(),
    ]);

    const baggageMetaTagContent = await page.locator('meta[name="baggage"]').getAttribute('content');

    // URL-encoded for parametrized 'GET /test-param/s0me-param' -> `GET /test-param/:param`
    expect(baggageMetaTagContent).toContain(`sentry-transaction=GET%20%2Ftest-param%2F%3Aparam`);
    expect(baggageMetaTagContent).toContain(`sentry-trace_id=${serverSpan.trace_id}`);
    expect(baggageMetaTagContent).toContain('sentry-sampled=true');
    expect(baggageMetaTagContent).toContain('sentry-sample_rate=1');

    const sentryTraceMetaTagContent = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
    const [metaTraceId, metaParentSpanId, metaSampled] = sentryTraceMetaTagContent?.split('-') || [];

    expect(metaSampled).toBe('1');

    expect(clientSpan).toMatchObject({
      name: '/test-param/:param()',
      is_segment: true,
      trace_id: metaTraceId,
      parent_span_id: metaParentSpanId,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'pageload' },
        'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
        'sentry.segment.name.source': { type: 'string', value: 'route' },
      }),
    });

    expect(serverSpan).toMatchObject({
      name: 'GET /test-param/:param()', // parametrized
      is_segment: true,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'http.server' },
        'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
        'sentry.segment.name.source': { type: 'string', value: 'route' },
      }),
    });

    // connected trace
    expect(clientSpan.trace_id).toBe(serverSpan.trace_id);
    expect(clientSpan.parent_span_id).toBe(serverSpan.span_id);
    expect(serverSpan.trace_id).toBe(metaTraceId);
  });

  test('capture a distributed trace from a client-side API request with parametrized routes', async ({ page }) => {
    // The `http.client` span ends after the pageload segment, so it can be flushed in a later
    // envelope. Accumulate until both spans have arrived.
    const clientSpansPromise = collectStreamedSpans('nuxt-3', spans => {
      return (
        spans.some(span => span.name === '/test-param/user/:userId()' && span.is_segment) &&
        spans.some(span => span.name === `GET /api/user/${PARAM}` && getSpanOp(span) === 'http.client')
      );
    });
    const ssrSpanPromise = waitForStreamedSpan('nuxt-3', span => {
      return span.is_segment && span.name.includes('GET /test-param/user');
    });
    const serverReqSpanPromise = waitForStreamedSpan('nuxt-3', span => {
      return span.is_segment && span.name.includes('GET /api/user/');
    });

    // Navigate to the page which will trigger an API call from the client-side
    await page.goto(`/test-param/user/${PARAM}`);

    const [clientSpans, ssrSpan, serverReqSpan] = await Promise.all([
      clientSpansPromise,
      ssrSpanPromise,
      serverReqSpanPromise,
    ]);

    const pageloadSpan = clientSpans.find(span => span.name === '/test-param/user/:userId()' && span.is_segment);
    const httpClientSpan = clientSpans.find(span => span.name === `GET /api/user/${PARAM}`);

    expect(pageloadSpan).toMatchObject({
      name: '/test-param/user/:userId()',
      is_segment: true,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'pageload' },
        'sentry.origin': { type: 'string', value: 'auto.pageload.vue' },
        'sentry.segment.name.source': { type: 'string', value: 'route' },
      }),
    });

    expect(httpClientSpan).toBeDefined();
    expect(httpClientSpan).toMatchObject({
      name: `GET /api/user/${PARAM}`, // fixme: parametrize
      parent_span_id: pageloadSpan?.span_id, // pageload span is parent
      attributes: expect.objectContaining({
        type: { type: 'string', value: 'fetch' },
        'sentry.op': { type: 'string', value: 'http.client' },
        'sentry.origin': { type: 'string', value: 'auto.http.browser' },
        'http.request.method': { type: 'string', value: 'GET' },
        'url.full': { type: 'string', value: expect.stringContaining(`/api/user/${PARAM}`) },
      }),
    });

    expect(ssrSpan).toMatchObject({
      name: 'GET /test-param/user/:userId()', // parametrized route
      is_segment: true,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'http.server' },
        'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
        'sentry.segment.name.source': { type: 'string', value: 'route' },
      }),
    });

    expect(serverReqSpan).toMatchObject({
      name: 'GET /api/user/:userId', // parametrized route
      is_segment: true,
      parent_span_id: httpClientSpan?.span_id, // http.client span is parent
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'http.server' },
        'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
      }),
    });

    // All 3 root spans and the http.client span should share the same trace_id
    expect(pageloadSpan?.trace_id).toBeDefined();
    expect(pageloadSpan?.trace_id).toBe(httpClientSpan?.trace_id);
    expect(pageloadSpan?.trace_id).toBe(ssrSpan.trace_id);
    expect(pageloadSpan?.trace_id).toBe(serverReqSpan.trace_id);
  });
});
