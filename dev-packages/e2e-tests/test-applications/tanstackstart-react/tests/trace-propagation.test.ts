import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

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

  // The SSR stream splits inside the long attribute that sits ahead of the head, so the meta
  // tags are only injected if the transform carries its state across chunks.
  // See https://github.com/getsentry/sentry-javascript/issues/23468.
  test('should inject metatags when the SSR stream splits ahead of the head', async ({ page }) => {
    await page.goto('/split-head-chunk');

    const sentryTraceContent = await page.getAttribute('meta[name="sentry-trace"]', 'content');
    expect(sentryTraceContent).toMatch(/^[a-f0-9]{32}-[a-f0-9]{16}-[01]$/);

    const baggageContent = await page.getAttribute('meta[name="baggage"]', 'content');
    expect(baggageContent).toContain('sentry-trace_id=');

    // The attribute that forces the chunk boundary must survive the rewrite.
    expect(await page.getAttribute('html', 'data-long')).toHaveLength(3000);
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
});
