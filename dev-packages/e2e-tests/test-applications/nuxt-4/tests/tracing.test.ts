import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('distributed tracing', () => {
  const PARAM = 's0me-param';

  test('capture a distributed pageload trace', async ({ page }) => {
    const clientTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/test-param/:param()';
    });

    const serverTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /test-param/') ?? false;
    });

    const [_, clientTxnEvent, serverTxnEvent] = await Promise.all([
      page.goto(`/test-param/${PARAM}`),
      clientTxnEventPromise,
      serverTxnEventPromise,
      expect(page.getByText(`Param: ${PARAM}`)).toBeVisible(),
    ]);

    const baggageMetaTagContent = await page.locator('meta[name="baggage"]').getAttribute('content');

    expect(baggageMetaTagContent).toContain(`sentry-trace_id=${serverTxnEvent.contexts?.trace?.trace_id}`);
    expect(baggageMetaTagContent).toContain(`sentry-transaction=GET%20%2Ftest-param%2F${PARAM}`); // URL-encoded for 'GET /test-param/s0me-param'
    expect(baggageMetaTagContent).toContain('sentry-sampled=true');
    expect(baggageMetaTagContent).toContain('sentry-sample_rate=1');

    const sentryTraceMetaTagContent = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
    const [metaTraceId, metaParentSpanId, metaSampled] = sentryTraceMetaTagContent?.split('-') || [];

    expect(metaSampled).toBe('1');

    expect(clientTxnEvent).toMatchObject({
      transaction: '/test-param/:param()',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'pageload',
          origin: 'auto.pageload.vue',
          trace_id: metaTraceId,
          parent_span_id: metaParentSpanId,
        },
      },
    });

    expect(serverTxnEvent).toMatchObject({
      transaction: `GET /test-param/${PARAM}`, // todo: parametrize (nitro)
      transaction_info: { source: 'url' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.otel.http',
        },
      },
    });

    // connected trace
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBeDefined();
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBeDefined();

    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
    expect(serverTxnEvent.contexts?.trace?.trace_id).toBe(metaTraceId);
  });

  test('capture a distributed trace from a client-side API request with parametrized routes', async ({ page }) => {
    const clientTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction === '/test-param/fetch-api/:param()';
    });
    const ssrTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /test-param/fetch-api') ?? false;
    });
    const serverReqTxnEventPromise = waitForTransaction('nuxt-4', txnEvent => {
      return txnEvent.transaction?.includes('GET /api/test-param/') ?? false;
    });

    // Navigate to the page which will trigger an API call from the client-side
    await page.goto(`/test-param/fetch-api/${PARAM}`);

    const [clientTxnEvent, ssrTxnEvent, serverReqTxnEvent] = await Promise.all([
      clientTxnEventPromise,
      ssrTxnEventPromise,
      serverReqTxnEventPromise,
    ]);

    const httpClientSpan = clientTxnEvent?.spans?.find(span => span.description === `GET /api/test-param/${PARAM}`);

    expect(clientTxnEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: '/test-param/fetch-api/:param()', // parametrized route
        transaction_info: { source: 'route' },
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            op: 'pageload',
            origin: 'auto.pageload.vue',
          }),
        }),
      }),
    );

    expect(httpClientSpan).toBeDefined();
    expect(httpClientSpan).toEqual(
      expect.objectContaining({
        description: `GET /api/test-param/${PARAM}`, // fixme: parametrize
        parent_span_id: clientTxnEvent.contexts?.trace?.span_id, // pageload span is parent
        data: expect.objectContaining({
          url: `/api/test-param/${PARAM}`, // fixme: parametrize
          type: 'fetch',
          'sentry.op': 'http.client',
          'sentry.origin': 'auto.http.browser',
          'http.method': 'GET',
        }),
      }),
    );

    expect(ssrTxnEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: `GET /test-param/fetch-api/${PARAM}`, // fixme: parametrize (nitro)
        transaction_info: { source: 'url' },
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            op: 'http.server',
            origin: 'auto.http.otel.http',
          }),
        }),
      }),
    );

    expect(serverReqTxnEvent).toEqual(
      expect.objectContaining({
        type: 'transaction',
        transaction: `GET /api/test-param/${PARAM}`,
        transaction_info: { source: 'url' },
        contexts: expect.objectContaining({
          trace: expect.objectContaining({
            op: 'http.server',
            origin: 'auto.http.otel.http',
            parent_span_id: httpClientSpan?.span_id, // http.client span is parent
          }),
        }),
      }),
    );

    // All 3 transactions and the http.client span should share the same trace_id
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBeDefined();
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(httpClientSpan?.trace_id);
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(ssrTxnEvent.contexts?.trace?.trace_id);
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverReqTxnEvent.contexts?.trace?.trace_id);
  });
});
