import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in static/pre-rendered routes', () => {
  test('only sends client pageload span with traceId from pre-rendered <meta> tags', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-4', txnEvent => {
      return txnEvent?.transaction === '/test-static';
    });

    waitForTransaction('astro-4', evt => {
      if (evt.platform !== 'javascript') {
        throw new Error('Server transaction should not be sent');
      }
      return false;
    });

    await page.goto('/test-static');

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
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      platform: 'javascript',
      transaction: '/test-static',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
    });

    await page.waitForTimeout(1000); // wait another sec to ensure no server transaction is sent
  });
});
