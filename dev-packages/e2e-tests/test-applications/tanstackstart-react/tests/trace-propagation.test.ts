import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test.describe('Trace propagation', () => {
  test('should inject metatags in ssr pageload', async ({ page }) => {
    await page.goto('/');

    const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    expect(sentryTraceContent).toBeDefined();
    expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

    const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
    expect(baggageContent).toBeDefined();
    expect(baggageContent).toContain('sentry-environment=qa');
    expect(baggageContent).toContain('sentry-public_key=');
    expect(baggageContent).toContain('sentry-trace_id=');
    expect(baggageContent).toContain('sentry-sampled=');
  });

  test('should have trace connection between server and client', async ({ page }) => {
    const spansPromise = collectStreamedSpans('tanstackstart-react', spans => {
      return (
        spans.some(
          span => span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/',
        ) &&
        spans.some(
          span =>
            span.is_segment &&
            getSpanOp(span) === 'pageload' &&
            (span.name === '/' || span.attributes['url.path']?.value === '/'),
        )
      );
    });

    await page.goto('/');

    const spans = await spansPromise;
    const serverSpan = spans.find(
      span => span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/',
    );
    const clientSpan = spans.find(span => span.is_segment && getSpanOp(span) === 'pageload');

    expect(serverSpan).toBeDefined();
    expect(clientSpan).toBeDefined();
    expect(clientSpan?.trace_id).toBe(serverSpan?.trace_id);
  });

  test('continues an incoming trace', async ({ request }) => {
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const parentSpanId = traceId.slice(0, 16);

    const segmentSpanPromise = waitForStreamedSpan(
      'tanstackstart-react',
      span => span.trace_id === traceId && span.is_segment,
    );

    await request.get('/api/user/1', {
      headers: {
        'sentry-trace': `${traceId}-${parentSpanId}-1`,
        baggage: `sentry-trace_id=${traceId},sentry-sample_rate=1,sentry-sampled=true`,
      },
    });

    const segmentSpan = await segmentSpanPromise;

    expect(getSpanOp(segmentSpan)).toBe('http.server');
    expect(segmentSpan.name).toBe('GET /api/user/$id');
    expect(segmentSpan.parent_span_id).toBe(parentSpanId);
  });

  test('adds sentry-trace and baggage headers to an outgoing fetch', async ({ request }) => {
    const segmentSpanPromise = waitForStreamedSpan(
      'tanstackstart-react',
      span => span.is_segment && getSpanOp(span) === 'http.server' && span.name === 'GET /api/outgoing-fetch',
    );
    const fetchSpanPromise = waitForStreamedSpan(
      'tanstackstart-react',
      span => getSpanOp(span) === 'http.client' && String(span.attributes['url.full']?.value).endsWith('/api/headers'),
    );

    const receivedHeaders = await (await request.get('/api/outgoing-fetch')).json();

    const segmentSpan = await segmentSpanPromise;
    const fetchSpan = await fetchSpanPromise;

    expect(fetchSpan.trace_id).toBe(segmentSpan.trace_id);
    expect(fetchSpan.parent_span_id).toBe(segmentSpan.span_id);
    expect(receivedHeaders.sentryTrace).toBe(`${segmentSpan.trace_id}-${fetchSpan.span_id}-1`);
    expect(receivedHeaders.baggage).toContain(`sentry-trace_id=${segmentSpan.trace_id}`);
  });
});
