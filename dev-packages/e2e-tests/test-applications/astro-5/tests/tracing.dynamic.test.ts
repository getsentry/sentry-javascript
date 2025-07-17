import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('tracing in dynamically rendered (ssr) routes', () => {
  test('sends server and client pageload spans with the same trace id', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction === '/test-ssr';
    });

    const serverPageRequestTxnPromise = waitForTransaction('astro-5', txnEvent => {
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

test.describe('nested SSR routes (client, server, server request)', () => {
  /** The user-page route fetches from an endpoint and creates a deeply nested span structure:
   * pageload — /user-page/myUsername123
   * ├── browser.** — multiple browser spans
   * └── browser.request — /user-page/myUsername123
   *     └── http.server — GET /user-page/[userId]                    (SSR page request)
   *         └── http.client — GET /api/user/myUsername123.json       (executing fetch call from SSR page - span)
   *             └── http.server — GET /api/user/myUsername123.json   (server request)
   */
  test('sends connected server and client pageload and request spans with the same trace id', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('/user-page/') ?? false;
    });

    const serverPageRequestTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('GET /user-page/') ?? false;
    });

    const serverHTTPServerRequestTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('GET /api/user/') ?? false;
    });

    await page.goto('/user-page/myUsername123');

    const clientPageloadTxn = await clientPageloadTxnPromise;
    const serverPageRequestTxn = await serverPageRequestTxnPromise;
    const serverHTTPServerRequestTxn = await serverHTTPServerRequestTxnPromise;
    const serverRequestHTTPClientSpan = serverPageRequestTxn.spans?.find(
      span => span.op === 'http.client' && span.description?.includes('/api/user/'),
    );

    const clientPageloadTraceId = clientPageloadTxn.contexts?.trace?.trace_id;

    // Verify all spans have the same trace ID
    expect(clientPageloadTraceId).toEqual(serverPageRequestTxn.contexts?.trace?.trace_id);
    expect(clientPageloadTraceId).toEqual(serverHTTPServerRequestTxn.contexts?.trace?.trace_id);
    expect(clientPageloadTraceId).toEqual(serverRequestHTTPClientSpan?.trace_id);

    // serverPageRequest has no parent (root span)
    expect(serverPageRequestTxn.contexts?.trace?.parent_span_id).toBeUndefined();

    // clientPageload's parent and serverRequestHTTPClient's parent is serverPageRequest
    const serverPageRequestSpanId = serverPageRequestTxn.contexts?.trace?.span_id;
    expect(clientPageloadTxn.contexts?.trace?.parent_span_id).toEqual(serverPageRequestSpanId);
    expect(serverRequestHTTPClientSpan?.parent_span_id).toEqual(serverPageRequestSpanId);

    // serverHTTPServerRequest's parent is serverRequestHTTPClient
    expect(serverHTTPServerRequestTxn.contexts?.trace?.parent_span_id).toEqual(serverRequestHTTPClientSpan?.span_id);
  });

  test('sends parametrized pageload, server and API request transaction names', async ({ page }) => {
    const clientPageloadTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('/user-page/') ?? false;
    });

    const serverPageRequestTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('GET /user-page/') ?? false;
    });

    const serverHTTPServerRequestTxnPromise = waitForTransaction('astro-5', txnEvent => {
      return txnEvent?.transaction?.startsWith('GET /api/user/') ?? false;
    });

    await page.goto('/user-page/myUsername123');

    const clientPageloadTxn = await clientPageloadTxnPromise;
    const serverPageRequestTxn = await serverPageRequestTxnPromise;
    const serverHTTPServerRequestTxn = await serverHTTPServerRequestTxnPromise;

    const serverRequestHTTPClientSpan = serverPageRequestTxn.spans?.find(
      span => span.op === 'http.client' && span.description?.includes('/api/user/'),
    );

    // Client pageload transaction - actual URL with pageload operation
    expect(clientPageloadTxn).toMatchObject({
      transaction: '/user-page/myUsername123', // todo: parametrize to '/user-page/[userId]'
      transaction_info: { source: 'url' },
      contexts: {
        trace: {
          op: 'pageload',
          origin: 'auto.pageload.browser',
          data: {
            'sentry.op': 'pageload',
            'sentry.origin': 'auto.pageload.browser',
            'sentry.source': 'url',
          },
        },
      },
    });

    // Server page request transaction - parametrized transaction name with actual URL in data
    expect(serverPageRequestTxn).toMatchObject({
      transaction: 'GET /user-page/[userId]',
      transaction_info: { source: 'route' },
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.astro',
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.astro',
            'sentry.source': 'route',
            url: expect.stringContaining('/user-page/myUsername123'),
          },
        },
      },
      request: { url: expect.stringContaining('/user-page/myUsername123') },
    });

    // HTTP client span - actual API URL with client operation
    expect(serverRequestHTTPClientSpan).toMatchObject({
      op: 'http.client',
      origin: 'auto.http.otel.node_fetch',
      description: 'GET http://localhost:3030/api/user/myUsername123.json', // todo: parametrize (this is just a span though - no transaction)
      data: {
        'sentry.op': 'http.client',
        'sentry.origin': 'auto.http.otel.node_fetch',
        'url.full': expect.stringContaining('/api/user/myUsername123.json'),
        'url.path': '/api/user/myUsername123.json',
        url: expect.stringContaining('/api/user/myUsername123.json'),
      },
    });

    // Server HTTP request transaction - should be parametrized (todo: currently not parametrized)
    expect(serverHTTPServerRequestTxn).toMatchObject({
      transaction: 'GET /api/user/myUsername123.json', // todo: should be parametrized to 'GET /api/user/[userId].json'
      transaction_info: { source: 'route' },
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.astro',
          data: {
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.astro',
            'sentry.source': 'route',
            url: expect.stringContaining('/api/user/myUsername123.json'),
          },
        },
      },
      request: { url: expect.stringContaining('/api/user/myUsername123.json') },
    });
  });
});
