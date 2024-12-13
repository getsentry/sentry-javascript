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
      transaction: 'GET /test-param/s0me-param', // todo: parametrize (nitro)
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
    expect(clientTxnEvent.contexts?.trace?.trace_id).toBe(serverTxnEvent.contexts?.trace?.trace_id);
    expect(clientTxnEvent.contexts?.trace?.parent_span_id).toBe(serverTxnEvent.contexts?.trace?.span_id);
  });
});
