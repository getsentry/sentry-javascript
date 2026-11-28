import { CODE_FUNCTION_NAME, ERROR_TYPE, HTTP_ROUTE, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { expect, test } from '@playwright/test';
import {
  collectStreamedSpans,
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';
import { IMPORT_SURFACES } from './importSurfaces';
import { SERVER_ORIGIN } from './runtime';

const RENDER_ORIGIN = 'auto.function.nuxt.render';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-5', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe(SERVER_ORIGIN);
});

test('sends a `renderPage` span for the page render as a child of the server root span', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes[URL_PATH]?.value === '/test-param/render-span',
    span => span.name === 'renderPage',
  );

  await request.get('/test-param/render-span');

  const spans = await spansPromise;
  const rootSpan = spans.find(span => span.is_segment);
  const renderSpans = spans.filter(span => span.attributes[SENTRY_ORIGIN]?.value === RENDER_ORIGIN);

  expect(renderSpans).toHaveLength(1);
  expect(renderSpans[0]?.name).toBe('renderPage');
  expect(renderSpans[0]?.status).toBe('ok');
  expect(renderSpans[0]?.parent_span_id).toBe(rootSpan?.span_id);
  expect(getSpanOp(renderSpans[0]!)).toBe(FUNCTION);
  expect(renderSpans[0]?.attributes[CODE_FUNCTION_NAME]).toEqual({ type: 'string', value: 'renderPage' });
  expect(renderSpans[0]?.attributes[HTTP_ROUTE]).toEqual({ type: 'string', value: '/test-param/:param()' });
});

test('keeps the ok status of the render span when a route middleware redirects', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes[URL_PATH]?.value === '/redirect-in-route-middleware',
    span => span.name === 'renderPage',
  );

  const response = await request.get('/redirect-in-route-middleware', { maxRedirects: 0 });

  const renderSpan = (await spansPromise).find(span => span.name === 'renderPage');

  expect(response.status()).toBe(302);
  expect(renderSpan?.status).toBe('ok');
  expect(renderSpan?.attributes[ERROR_TYPE]).toBeUndefined();
  // The router is already at the target of the redirect, so the span has no route.
  expect(renderSpan?.attributes[HTTP_ROUTE]).toBeUndefined();
});

test('keeps the ok status of the render span for a URL that matches no page', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    'nuxt-5',
    span => span.attributes[URL_PATH]?.value === '/no-page-for-this-url',
    span => span.name === 'renderPage',
  );

  const response = await request.get('/no-page-for-this-url');

  const renderSpan = (await spansPromise).find(span => span.name === 'renderPage');

  expect(response.status()).toBe(404);
  expect(renderSpan?.status).toBe('ok');
});

[
  // Nuxt build output that the HTTP integration does not ignore.
  '/_nuxt/builds/latest.json',
  '/_nuxt/entry.js.map',
  // File from `public/` that the HTTP integration does not ignore.
  '/humans.txt',
  // Common static file that the HTTP integration ignores.
  '/favicon.ico',
].forEach(path => {
  test(`does not send a server span for the file ${path}`, async ({ baseURL }) => {
    const segmentPaths = await getServerSegmentPathsUntilPage(`${baseURL}`, path);

    expect(segmentPaths).not.toContain(path);
  });
});

// Routes that look like build output. They also show that the helper sees sent segments, so the tests above cannot
// pass by accident.
['/test-param/jane.doe', '/api/test-param/data.json', '/test-param/_nuxt/'].forEach(path => {
  test(`sends a server span for the route ${path}`, async ({ baseURL }) => {
    const segmentPaths = await getServerSegmentPathsUntilPage(`${baseURL}`, path);

    expect(segmentPaths).toContain(path);
  });
});

IMPORT_SURFACES.forEach(({ name, apiPrefix }) => {
  test(`captures server API calls made with Nitro $fetch (${name})`, async ({ page }) => {
    // The server-side http.client span can flush before its segment. Accumulate until both arrived.
    const spansPromise = collectStreamedSpans('nuxt-5', spans => {
      return (
        spans.some(span => span.is_segment && span.attributes['url.path']?.value === `${apiPrefix}/nitro-fetch`) &&
        spans.some(
          span => getSpanOp(span) === 'http.client' && span.attributes['url.full']?.value === 'https://example.com/',
        )
      );
    });

    await page.goto(`/fetch-server-routes?apiPrefix=${apiPrefix}`);
    await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

    const spans = await spansPromise;

    const serverSegmentSpan = spans.find(
      span => span.is_segment && span.attributes['url.path']?.value === `${apiPrefix}/nitro-fetch`,
    );
    const httpClientSpan = spans.find(
      span => getSpanOp(span) === 'http.client' && span.attributes['url.full']?.value === 'https://example.com/',
    );

    expect(serverSegmentSpan).toBeDefined();
    expect(getSpanOp(serverSegmentSpan!)).toBe('http.server');

    expect(httpClientSpan).toBeDefined();
    expect(httpClientSpan?.name).toBe('GET example.com');
    expect(httpClientSpan?.trace_id).toBe(serverSegmentSpan?.trace_id);
    expect(httpClientSpan?.parent_span_id).toBe(serverSegmentSpan?.span_id);
  });
});

/**
 * Requests `path`, then a page. Returns the `url.path` of each server segment up to the page's segment, which arrives
 * after any segment for `path`.
 */
async function getServerSegmentPathsUntilPage(baseURL: string, path: string): Promise<string[]> {
  const pagePath = `/test-param/after${path.replace(/\W+/g, '-')}`;
  const segmentPaths: string[] = [];
  const pageSegmentPromise = waitForStreamedSpans('nuxt-5', spans => {
    segmentPaths.push(...spans.filter(span => span.is_segment).map(span => `${span.attributes[URL_PATH]?.value}`));
    return segmentPaths.includes(pagePath);
  });

  await fetch(`${baseURL}${path}`);
  await fetch(`${baseURL}${pagePath}`);
  await pageSegmentPromise;

  return segmentPaths;
}
