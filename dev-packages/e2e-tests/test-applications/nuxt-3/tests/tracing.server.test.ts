import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('sends a server root span on pageload', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return span.is_segment && span.name.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const serverSpan = await serverSpanPromise;

  expect(getSpanOp(serverSpan)).toBe('http.server');
  expect(serverSpan.attributes['sentry.origin']?.value).toBe('auto.http.http_server');
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

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const serverSpanPromise = waitForStreamedSpan('nuxt-3', span => {
    return span.is_segment && span.name.includes('GET /api/test-param/');
  });

  await fetch(`${baseURL}/api/test-param/headers-test`, {
    headers: {
      'User-Agent': 'Custom-Nuxt-Agent/3.0',
      'Content-Type': 'application/json',
      'X-Nuxt-Test': 'nuxt-header-value',
      Accept: 'application/json, text/html',
      'X-Framework': 'Nuxt',
      'X-Request-ID': 'nuxt-456',
    },
  });

  const serverSpan = await serverSpanPromise;

  expect(serverSpan.attributes).toMatchObject({
    'http.request.header.user-agent': { type: 'array', value: ['Custom-Nuxt-Agent/3.0'] },
    'http.request.header.content-type': { type: 'array', value: ['application/json'] },
    'http.request.header.x-nuxt-test': { type: 'array', value: ['nuxt-header-value'] },
    'http.request.header.accept': { type: 'array', value: ['application/json, text/html'] },
    'http.request.header.x-framework': { type: 'array', value: ['Nuxt'] },
    'http.request.header.x-request-id': { type: 'array', value: ['nuxt-456'] },
  });
});

/**
 * Requests `path`, then a page. Returns the `url.path` of each server segment up to the page's segment, which arrives
 * after any segment for `path`.
 */
async function getServerSegmentPathsUntilPage(baseURL: string, path: string): Promise<string[]> {
  const pagePath = `/test-param/after${path.replace(/\W+/g, '-')}`;
  const segmentPaths: string[] = [];
  const pageSegmentPromise = waitForStreamedSpans('nuxt-3', spans => {
    segmentPaths.push(...spans.filter(span => span.is_segment).map(span => `${span.attributes['url.path']?.value}`));
    return segmentPaths.includes(pagePath);
  });

  await fetch(`${baseURL}${path}`);
  await fetch(`${baseURL}${pagePath}`);
  await pageSegmentPromise;

  return segmentPaths;
}
