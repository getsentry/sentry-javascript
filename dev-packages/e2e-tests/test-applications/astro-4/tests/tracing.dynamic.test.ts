import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in dynamically rendered (ssr) routes', () => {
  test('sends server and client pageload spans with the same trace id', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-4', txnEvent => {
      return txnEvent?.transaction === '/test-ssr';
    });

    const serverPageRequestTxnPromise = waitForTransaction('astro-4', txnEvent => {
      return txnEvent?.transaction === 'GET /test-ssr';
    });

    await page.goto('/test-ssr');

    const clientPageloadTxn = await clientPageloadTxnPromise;
    const serverPageRequestTxn = await serverPageRequestTxnPromise;

    const clientPageloadTraceId = clientPageloadTxn.contexts?.trace?.trace_id;
    const clientPageloadParentSpanId = clientPageloadTxn.contexts?.trace?.parent_span_id;

    const serverPageRequestTraceId = serverPageRequestTxn.contexts?.trace?.trace_id;
    const serverPageloadSpanId = serverPageRequestTxn.contexts?.trace?.span_id;

    expect(clientPageloadTraceId).toEqual(serverPageRequestTraceId);
    expect(clientPageloadParentSpanId).toEqual(serverPageloadSpanId);

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
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      environment: 'qa',
      event_id: expect.stringMatching(/[a-f0-9]{32}/),
      measurements: expect.any(Object),
      platform: 'javascript',
      request: expect.any(Object),
      sdk: {
        integrations: expect.any(Array),
        name: 'sentry.javascript.astro',
        packages: expect.any(Array),
        version: expect.any(String),
      },
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: '/test-ssr',
      transaction_info: {
        source: 'url',
      },
      type: 'transaction',
    });

    expect(serverPageRequestTxn).toMatchObject({
      breadcrumbs: expect.any(Array),
      contexts: {
        app: expect.any(Object),
        cloud_resource: expect.any(Object),
        culture: expect.any(Object),
        device: expect.any(Object),
        os: expect.any(Object),
        otel: expect.any(Object),
        runtime: expect.any(Object),
        trace: {
          data: {
            'http.response.status_code': 200,
            method: 'GET',
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.astro',
            'sentry.sample_rate': 1,
            'sentry.source': 'route',
            url: expect.stringContaining('/test-ssr'),
          },
          op: 'http.server',
          origin: 'auto.http.astro',
          status: 'ok',
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      environment: 'qa',
      event_id: expect.stringMatching(/[a-f0-9]{32}/),
      platform: 'node',
      request: {
        cookies: {},
        headers: expect.objectContaining({
          // demonstrates that request data integration can extract headers
          accept: expect.any(String),
          'accept-encoding': expect.any(String),
          'user-agent': expect.any(String),
        }),
        method: 'GET',
        url: expect.stringContaining('/test-ssr'),
      },
      sdk: {
        integrations: expect.any(Array),
        name: 'sentry.javascript.astro',
        packages: expect.any(Array),
        version: expect.any(String),
      },
      server_name: expect.any(String),
      spans: expect.any(Array),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: 'GET /test-ssr',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
    });
  });
});
