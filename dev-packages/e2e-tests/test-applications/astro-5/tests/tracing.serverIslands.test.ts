import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in static routes with server islands', () => {
  test('only sends client pageload transaction and server island endpoint transaction', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction === '/server-island';
    });

    const serverIslandEndpointTxnPromise = waitForTransaction('astro-5', evt => {
      return !!evt.transaction?.startsWith('GET /_server-islands');
    });

    await page.goto('/server-island');

    const clientPageloadTxn = await clientPageloadTxnPromise;

    const clientPageloadTraceId = clientPageloadTxn.contexts?.trace?.trace_id;
    const clientPageloadParentSpanId = clientPageloadTxn.contexts?.trace?.parent_span_id;

    const sentryTraceMetaTagContent = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
    const baggageMetaTagContent = await page.locator('meta[name="baggage"]').getAttribute('content');

    const [metaTraceId, metaParentSpanId, metaSampled] = sentryTraceMetaTagContent?.split('-') || [];

    expect(clientPageloadTraceId).toMatch(/[a-f0-9]{32}/);
    expect(clientPageloadParentSpanId).toMatch(/[a-f0-9]{16}/);
    expect(metaSampled).toBe('1');

    expect(clientPageloadTxn).toMatchObject({
      contexts: {
        trace: {
          data: expect.objectContaining({
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.browser',
            'sentry.source': 'url',
          }),
          op: 'pageload',
          origin: 'auto.pageload.browser',
          parent_span_id: metaParentSpanId,
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: metaTraceId,
        },
      },
      platform: 'javascript',
      transaction: '/server-island',
      transaction_info: {
        source: 'url',
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

    expect(baggageMetaTagContent).toContain('sentry-transaction=GET%20%2Fserver-island%2F'); // URL-encoded for 'GET /test-static/'
    expect(baggageMetaTagContent).toContain('sentry-sampled=true');

    const serverIslandEndpointTxn = await serverIslandEndpointTxnPromise;

    expect(serverIslandEndpointTxn).toMatchObject({
      contexts: {
        trace: {
          data: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.astro',
            'sentry.source': 'route',
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
