import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

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
    const serverSpanPromise = waitForStreamedSpan('tanstackstart-react-cloudflare', span => {
      return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/';
    });

    const clientSpanPromise = waitForStreamedSpan('tanstackstart-react-cloudflare', span => {
      return span.is_segment && getSpanOp(span) === 'pageload' && span.name === '/';
    });

    await page.goto('/');

    const serverSpan = await serverSpanPromise;
    const clientSpan = await clientSpanPromise;

    expect(clientSpan.trace_id).toBe(serverSpan.trace_id);
  });
});
