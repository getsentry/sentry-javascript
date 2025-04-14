import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('distributed tracing', () => {
  const PARAM = 's0me-param';

  test('capture a distributed pageload trace', async ({ page }) => {
    const clientTxnEventPromise = waitForTransaction('nuxt-3-dynamic-import', txnEvent => {
      return txnEvent.transaction === '/test-param/:param()';
    });

    const serverTxnEventPromise = waitForTransaction('nuxt-3-dynamic-import', txnEvent => {
      return txnEvent.transaction.includes('GET /test-param/');
    });

    const res = await page.goto(`/test-param/${PARAM}`);
    const data = await res.json();

    const [clientTxnEvent, serverTxnEvent] = await Promise.all([
      clientTxnEventPromise,
      serverTxnEventPromise,
      expect(page.getByText(`Param: ${PARAM}`)).toBeVisible(),
    ]);

    expect(clientTxnEvent).toMatchObject({
      transaction: '/test-param/:param()',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'pageload',
          origin: 'auto.pageload.vue',
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

    const baggage = (data.headers.baggage || null).split(',');

    // connected trace
    expect(clientTxnEvent.contexts?.trace?.trace_id).not.toBeUndefined();
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).not.toBeUndefined();
    expect(baggage).not.toBeNull();

    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
    expect(baggage).toEqual(
      expect.arrayContaining([
        'sentry-sample-rate=1.0',
        'sentry-sampled=true',
        `sentry-trace_id=${serverTxnEvent.contexts?.trace?.trace_id}`,
        `sentry-transaction=GET%20%2Ftest-param%2F${PARAM}`,
      ]),
    );
  });
});
