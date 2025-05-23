import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('distributed tracing', () => {
  const PARAM = 's0me-param';

  test('capture a distributed pageload trace', async ({ page }) => {
    const clientTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction === '/test-param/:param()';
    });

    const serverTxnEventPromise = waitForTransaction('nuxt-3', txnEvent => {
      return txnEvent.transaction.includes('GET /test-param/');
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
});
