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
            'sentry.sample_rate': 1,
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
      transaction: '/test-static',
      transaction_info: {
        source: 'url',
      },
      type: 'transaction',
    });

    expect(baggageMetaTagContent).toContain('sentry-transaction=GET%20%2Ftest-static%2F'); // URL-encoded for 'GET /test-static/'
    expect(baggageMetaTagContent).toContain('sentry-sampled=true');

    await page.waitForTimeout(1000); // wait another sec to ensure no server transaction is sent
  });
});
