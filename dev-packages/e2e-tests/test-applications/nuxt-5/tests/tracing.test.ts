import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { IMPORT_SURFACES } from './importSurfaces';

function expectSegmentSpan(
  span: SerializedStreamedSpan | undefined,
  expected: { name: string; op: string; origin: string },
) {
  expect(span?.name).toBe(expected.name);
  expect(span?.is_segment).toBe(true);
  expect(span?.attributes['sentry.op']?.value).toBe(expected.op);
  expect(span?.attributes['sentry.origin']?.value).toBe(expected.origin);
  expect(span?.attributes['sentry.segment.name.source']?.value).toBe('route');
}

test.describe('distributed tracing', () => {
  const PARAM = 's0me-param';

  test('captures a distributed pageload trace', async ({ page }) => {
    const clientSpanPromise = waitForStreamedSpan('nuxt-5', span => {
      return getSpanOp(span) === 'pageload' && span.is_segment;
    });

    const serverSpanPromise = waitForStreamedSpan('nuxt-5', span => {
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

    expectSegmentSpan(clientSpan, { name: '/test-param/:param()', op: 'pageload', origin: 'auto.pageload.vue' });
    expect(clientSpan.trace_id).toBe(metaTraceId);
    expect(clientSpan.parent_span_id).toBe(metaParentSpanId);

    expectSegmentSpan(serverSpan, {
      name: 'GET /test-param/:param()',
      op: 'http.server',
      origin: 'auto.http.http_server',
    });
    expect(serverSpan.trace_id).toBe(metaTraceId);
    expect(clientSpan.parent_span_id).toBe(serverSpan.span_id);
  });

  IMPORT_SURFACES.forEach(({ name, apiPrefix }) => {
    test(`captures a distributed trace from a client-side API request with parametrized routes (${name})`, async ({
      page,
      baseURL,
    }) => {
      const API_PATH = `${apiPrefix}/user/${PARAM}`;

      // The `http.client` span ends after the pageload segment, so it can be flushed in a later
      // envelope. Accumulate until both spans have arrived.
      const clientSpansPromise = collectStreamedSpans('nuxt-5', spans => {
        return (
          spans.some(span => span.name === '/test-param/user/:userId()' && span.is_segment) &&
          spans.some(
            span => getSpanOp(span) === 'http.client' && `${span.attributes['url.full']?.value}`.includes(API_PATH),
          )
        );
      });
      const ssrSpanPromise = waitForStreamedSpan('nuxt-5', span => {
        return span.is_segment && span.name.includes('GET /test-param/user');
      });
      const serverReqSpanPromise = waitForStreamedSpan('nuxt-5', span => {
        return span.is_segment && span.name.includes(`GET ${apiPrefix}/user/`);
      });

      // Navigate to the page which will trigger an API call from the client-side
      await page.goto(`/test-param/user/${PARAM}?apiPrefix=${apiPrefix}`);

      const [clientSpans, ssrSpan, serverReqSpan] = await Promise.all([
        clientSpansPromise,
        ssrSpanPromise,
        serverReqSpanPromise,
      ]);

      const pageloadSpan = clientSpans.find(span => span.name === '/test-param/user/:userId()' && span.is_segment);
      const httpClientSpan = clientSpans.find(
        span => getSpanOp(span) === 'http.client' && `${span.attributes['url.full']?.value}`.includes(API_PATH),
      );

      expectSegmentSpan(pageloadSpan, {
        name: '/test-param/user/:userId()',
        op: 'pageload',
        origin: 'auto.pageload.vue',
      });

      // A relative fetch has no domain of its own, so it resolves against the page origin.
      expect(httpClientSpan?.name).toBe('GET localhost');
      expect(httpClientSpan?.is_segment).toBe(false);
      expect(httpClientSpan?.parent_span_id).toBe(pageloadSpan?.span_id);
      expect(httpClientSpan?.attributes['type']?.value).toBe('fetch');
      expect(httpClientSpan?.attributes['sentry.op']?.value).toBe('http.client');
      expect(httpClientSpan?.attributes['sentry.origin']?.value).toBe('auto.http.browser');
      expect(httpClientSpan?.attributes['http.request.method']?.value).toBe('GET');
      expect(httpClientSpan?.attributes['url.full']?.value).toBe(`${baseURL}${API_PATH}`);
      expect(httpClientSpan?.attributes['url.domain']?.value).toBe('localhost');

      expectSegmentSpan(ssrSpan, {
        name: 'GET /test-param/user/:userId()',
        op: 'http.server',
        origin: 'auto.http.http_server',
      });

      expectSegmentSpan(serverReqSpan, {
        name: `GET ${apiPrefix}/user/:userId`,
        op: 'http.server',
        origin: 'auto.http.http_server',
      });
      expect(serverReqSpan.parent_span_id).toBe(httpClientSpan?.span_id);

      // `collectStreamedSpans` already guarantees the pageload and http.client spans share a trace,
      // so only the independently awaited server spans need the check.
      expect(ssrSpan.trace_id).toBe(pageloadSpan?.trace_id);
      expect(serverReqSpan.trace_id).toBe(pageloadSpan?.trace_id);
    });
  });
});
