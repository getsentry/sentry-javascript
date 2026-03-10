import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in static routes with server islands', () => {
  // In Astro 6, server island endpoint requests no longer produce a server transaction
  // because the Vite Environment API refactor changed how these requests are handled.
  // We still verify client-side pageload behavior and that the server island resource is loaded.
  test('sends client pageload transaction for static page with server island', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-6', txnEvent => {
      return txnEvent.transaction === '/server-island';
    });

    await page.goto('/server-island');

    const clientPageloadTxn = await clientPageloadTxnPromise;
    const clientPageloadTraceId = clientPageloadTxn.contexts?.trace?.trace_id;
    const clientPageloadParentSpanId = clientPageloadTxn.contexts?.trace?.parent_span_id;

    const sentryTraceMetaTags = await page.locator('meta[name="sentry-trace"]').count();
    expect(sentryTraceMetaTags).toBe(0);

    const baggageMetaTags = await page.locator('meta[name="baggage"]').count();
    expect(baggageMetaTags).toBe(0);

    expect(clientPageloadTraceId).toMatch(/[a-f0-9]{32}/);
    expect(clientPageloadParentSpanId).toBeUndefined();

    expect(clientPageloadTxn).toMatchObject({
      contexts: {
        trace: {
          data: expect.objectContaining({
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.astro',
            'sentry.source': 'route',
          }),
          op: 'pageload',
          origin: 'auto.pageload.astro',
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: clientPageloadTraceId,
        },
      },
      platform: 'javascript',
      transaction: '/server-island',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
    });

    const pageloadSpans = clientPageloadTxn.spans;

    // pageload transaction contains a resource link span for the preloaded server island request
    expect(pageloadSpans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'resource.link',
          origin: 'auto.resource.browser.metrics',
          description: expect.stringMatching(/\/_server-islands\/Avatar.*$/),
        }),
      ]),
    );

    await page.waitForTimeout(1000); // wait another sec to ensure no server transaction is sent
  });
});
