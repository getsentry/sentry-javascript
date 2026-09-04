import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7';

function isSegmentNamed(op: string, name: string): (span: SerializedStreamedSpan) => boolean {
  return span => getSpanOp(span) === op && span.is_segment && span.name === name;
}

test.describe('tracing in dynamically rendered (ssr) routes', () => {
  test('sends server and client pageload spans with the same trace id', async ({ page }) => {
    const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('pageload', '/test-ssr'));

    const serverPageRequestSpanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('http.server', 'GET /test-ssr'));

    await page.goto('/test-ssr');

    const clientPageloadSpan = await clientPageloadSpanPromise;
    const serverPageRequestSpan = await serverPageRequestSpanPromise;

    expect(clientPageloadSpan.trace_id).toEqual(serverPageRequestSpan.trace_id);
    expect(clientPageloadSpan.parent_span_id).toEqual(serverPageRequestSpan.span_id);

    expect(clientPageloadSpan).toMatchObject({
      name: '/test-ssr',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      is_segment: true,
    });
    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.astro', type: 'string' },
      'sentry.sdk.version': { value: expect.any(String), type: 'string' },
    });

    expect(serverPageRequestSpan).toMatchObject({
      name: 'GET /test-ssr',
      status: 'ok',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      is_segment: true,
    });
    expect(serverPageRequestSpan.attributes).toMatchObject({
      'http.response.status_code': { value: 200, type: 'integer' },
      method: { value: 'GET', type: 'string' },
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.sample_rate': { value: 1, type: 'integer' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'sentry.environment': { value: 'qa', type: 'string' },
      'sentry.sdk.name': { value: 'sentry.javascript.astro', type: 'string' },
      'url.full': { value: expect.stringContaining('/test-ssr'), type: 'string' },
      // demonstrates that the request data integration can extract headers
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate, br, zstd', type: 'string' },
      'http.request.header.accept_language': { value: 'en-US', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'navigate', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });
  });
});

test.describe('nested SSR routes (client, server, server request)', () => {
  /** The user-page route fetches from an endpoint and creates a deeply nested span structure:
   * pageload — /user-page/[userId]
   * ├── browser.** — multiple browser spans
   * └── browser.request — /user-page/myUsername123
   *     └── http.server — GET /user-page/[userId]                    (SSR page request)
   *         └── http.client — GET localhost                          (executing fetch call from SSR page - span)
   *             └── http.server — GET /api/user/[userId].json        (server request)
   */
  // Every span of this page load is identifiable on its own, so each is awaited separately. That
  // keeps "they share a trace" an assertion rather than the selector the spans are looked up by.
  const isApiRequestSpan = (span: SerializedStreamedSpan): boolean =>
    getSpanOp(span) === 'http.server' && span.name === 'GET /api/user/[userId].json';
  const isApiFetchSpan = (span: SerializedStreamedSpan): boolean =>
    getSpanOp(span) === 'http.client' &&
    String(span.attributes['url.full']?.value).includes('/api/user/myUsername123.json');

  const waitForUserPageSpans = (): Promise<
    [SerializedStreamedSpan, SerializedStreamedSpan, SerializedStreamedSpan, SerializedStreamedSpan]
  > =>
    Promise.all([
      waitForStreamedSpan(APP_NAME, isSegmentNamed('pageload', '/user-page/[userId]')),
      waitForStreamedSpan(APP_NAME, isSegmentNamed('http.server', 'GET /user-page/[userId]')),
      waitForStreamedSpan(APP_NAME, isApiRequestSpan),
      waitForStreamedSpan(APP_NAME, isApiFetchSpan),
    ]);

  test('sends connected server and client pageload and request spans with the same trace id', async ({ page }) => {
    const spansPromise = waitForUserPageSpans();

    await page.goto('/user-page/myUsername123');

    const [clientPageloadSpan, serverPageRequestSpan, serverHTTPServerRequestSpan, serverRequestHTTPClientSpan] =
      await spansPromise;

    // All four spans belong to the same trace
    const traceId = serverPageRequestSpan.trace_id;
    expect(clientPageloadSpan.trace_id).toEqual(traceId);
    expect(serverHTTPServerRequestSpan.trace_id).toEqual(traceId);
    expect(serverRequestHTTPClientSpan.trace_id).toEqual(traceId);

    // serverPageRequest has no parent (root span)
    expect(serverPageRequestSpan.parent_span_id).toBeUndefined();

    // clientPageload's parent and serverRequestHTTPClient's parent is serverPageRequest
    expect(clientPageloadSpan.parent_span_id).toEqual(serverPageRequestSpan.span_id);
    expect(serverRequestHTTPClientSpan.parent_span_id).toEqual(serverPageRequestSpan.span_id);

    // serverHTTPServerRequest's parent is serverRequestHTTPClient
    expect(serverHTTPServerRequestSpan.parent_span_id).toEqual(serverRequestHTTPClientSpan.span_id);
  });

  test('sends parametrized pageload, server and API request span names', async ({ page }) => {
    const spansPromise = waitForUserPageSpans();

    await page.goto('/user-page/myUsername123');

    const routeNameMetaContent = await page.locator('meta[name="sentry-route-name"]').getAttribute('content');
    expect(routeNameMetaContent).toBe('%2Fuser-page%2F%5BuserId%5D');

    const [clientPageloadSpan, serverPageRequestSpan, serverHTTPServerRequestSpan, serverRequestHTTPClientSpan] =
      await spansPromise;

    // Client pageload span - parametrized route with pageload operation
    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });

    // Server page request span - parametrized span name with the actual URL in the attributes
    expect(serverPageRequestSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.full': { value: expect.stringContaining('/user-page/myUsername123'), type: 'string' },
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate, br, zstd', type: 'string' },
      'http.request.header.accept_language': { value: 'en-US', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'navigate', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });

    // HTTP client span - with span streaming only the domain is kept in the name, the URL lives in
    // the attributes
    expect(serverRequestHTTPClientSpan.name).toBe('GET localhost');
    expect(serverRequestHTTPClientSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.client', type: 'string' },
      'sentry.origin': { value: 'auto.http.node_fetch', type: 'string' },
      'url.full': { value: expect.stringContaining('/api/user/myUsername123.json'), type: 'string' },
      'url.path': { value: '/api/user/myUsername123.json', type: 'string' },
    });

    // Server HTTP request span
    expect(serverHTTPServerRequestSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.full': { value: expect.stringContaining('/api/user/myUsername123.json'), type: 'string' },
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate', type: 'string' },
      'http.request.header.accept_language': { value: '*', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'cors', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });
  });

  test('sends parametrized pageload and server span names for catch-all routes', async ({ page }) => {
    const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('pageload', '/catchAll/[...path]'));

    const serverPageRequestSpanPromise = waitForStreamedSpan(
      APP_NAME,
      isSegmentNamed('http.server', 'GET /catchAll/[...path]'),
    );

    await page.goto('/catchAll/hell0/whatever-do');

    const routeNameMetaContent = await page.locator('meta[name="sentry-route-name"]').getAttribute('content');
    expect(routeNameMetaContent).toBe('%2FcatchAll%2F%5B...path%5D');

    const clientPageloadSpan = await clientPageloadSpanPromise;
    const serverPageRequestSpan = await serverPageRequestSpanPromise;

    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });

    expect(serverPageRequestSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.full': { value: expect.stringContaining('/catchAll/hell0/whatever-do'), type: 'string' },
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate, br, zstd', type: 'string' },
      'http.request.header.accept_language': { value: 'en-US', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'navigate', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });
  });
});

// Case for `user-page/[id]` vs. `user-page/settings` static routes
test.describe('parametrized vs static paths', () => {
  test('should use static route name for static route in parametrized path', async ({ page }) => {
    const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('pageload', '/user-page/settings'));

    const serverPageRequestSpanPromise = waitForStreamedSpan(
      APP_NAME,
      isSegmentNamed('http.server', 'GET /user-page/settings'),
    );

    await page.goto('/user-page/settings');

    const clientPageloadSpan = await clientPageloadSpanPromise;
    const serverPageRequestSpan = await serverPageRequestSpanPromise;

    expect(clientPageloadSpan.attributes).toMatchObject({
      'sentry.op': { value: 'pageload', type: 'string' },
      'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
    });

    expect(serverPageRequestSpan.attributes).toMatchObject({
      'sentry.op': { value: 'http.server', type: 'string' },
      'sentry.origin': { value: 'auto.http.astro', type: 'string' },
      'sentry.segment.name.source': { value: 'route', type: 'string' },
      'url.full': { value: expect.stringContaining('/user-page/settings'), type: 'string' },
      'http.request.header.accept': { value: expect.any(String), type: 'string' },
      'http.request.header.accept_encoding': { value: 'gzip, deflate, br, zstd', type: 'string' },
      'http.request.header.accept_language': { value: 'en-US', type: 'string' },
      'http.request.header.sec_fetch_mode': { value: 'navigate', type: 'string' },
      'http.request.header.user_agent': { value: expect.any(String), type: 'string' },
    });
  });

  test('allows for span name override via beforeStartSpan', async ({ page }) => {
    const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('pageload', '/blog/my-post'));

    await page.goto('/blog/my-post');

    const clientPageloadSpan = await clientPageloadSpanPromise;

    expect(clientPageloadSpan.attributes['sentry.segment.name.source']?.value).toBe('custom');
  });
});
