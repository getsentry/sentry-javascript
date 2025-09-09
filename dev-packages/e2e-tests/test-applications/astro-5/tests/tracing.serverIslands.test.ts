import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in static routes with server islands', () => {
  test('only sends client pageload transaction and server island endpoint transaction', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent.transaction === '/server-island';
    });

    const serverIslandEndpointTxnPromise = waitForTransaction('astro-5', evt => {
      return evt.transaction === 'GET /_server-islands/[name]';
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

    const serverIslandEndpointTxn = await serverIslandEndpointTxnPromise;

    expect(serverIslandEndpointTxn).toMatchObject({
      contexts: {
        trace: {
          data: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.astro',
            'sentry.source': 'route',
            'http.request.header.accept': expect.any(String),
            'http.request.header.accept_encoding': 'gzip, deflate, br, zstd',
            'http.request.header.accept_language': 'en-US',
            'http.request.header.sec_fetch_mode': 'cors',
            'http.request.header.user_agent': expect.any(String),
          }),
          op: 'http.server',
          origin: 'auto.http.astro',
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      transaction: 'GET /_server-islands/[name]',
    });

    const serverIslandEndpointTraceId = serverIslandEndpointTxn.contexts?.trace?.trace_id;

    // unfortunately, the server island trace id is not the same as the client pageload trace id
    // this is because the server island endpoint request is made as a resource link request,
    // meaning our fetch instrumentation can't attach headers to the request :(
    expect(serverIslandEndpointTraceId).not.toBe(clientPageloadTraceId);

    await page.waitForTimeout(1000); // wait another sec to ensure no server transaction is sent
  });
});
