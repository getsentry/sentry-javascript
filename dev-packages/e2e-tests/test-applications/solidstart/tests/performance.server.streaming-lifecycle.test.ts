import { URL_PATH } from '@sentry/conventions/attributes';
import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

test('sends a server action span on pageload', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart',
    spans =>
      spans.some(
        span =>
          span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/users/6',
      ) && spans.some(span => span.name === 'getPrefecture'),
  );

  await page.goto('/users/6');

  const spans = await spansPromise;
  const functionSpan = spans.find(span => span.name === 'getPrefecture');

  expect(functionSpan).toBeDefined();
  expect(functionSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.function.solidstart', type: 'string' },
    'code.function.name': { value: 'getPrefecture', type: 'string' },
  });
});

test('sends a server action span on client navigation', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    'solidstart',
    spans =>
      spans.some(span => span.is_segment && span.name === 'POST getPrefecture') &&
      spans.some(span => span.name === 'getPrefecture' && !span.is_segment),
  );

  await page.goto('/');
  await page.locator('#navLink').click();
  await page.waitForURL('/users/5');

  const spans = await spansPromise;
  const functionSpan = spans.find(span => span.name === 'getPrefecture' && !span.is_segment);

  expect(functionSpan).toBeDefined();
  expect(functionSpan?.attributes).toMatchObject({
    'sentry.op': { value: 'function', type: 'string' },
    'sentry.origin': { value: 'auto.function.solidstart', type: 'string' },
    'code.function.name': { value: 'getPrefecture', type: 'string' },
  });
});

[
  // SolidStart build output that the HTTP integration does not ignore.
  '/_build/assets/entry.js.map',
  '/_build/.vite/manifest.json',
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
['/users/jane.doe', '/users/_build/'].forEach(path => {
  test(`sends a server span for the route ${path}`, async ({ baseURL }) => {
    const segmentPaths = await getServerSegmentPathsUntilPage(`${baseURL}`, path);

    expect(segmentPaths).toContain(path);
  });
});

/**
 * Requests `path`, then a page. Returns the `url.path` of each server segment up to the page's segment, which arrives
 * after any segment for `path`.
 */
async function getServerSegmentPathsUntilPage(baseURL: string, path: string): Promise<string[]> {
  const pagePath = `/users/after${path.replace(/\W+/g, '-')}`;
  const segmentPaths: string[] = [];
  const pageSegmentPromise = waitForStreamedSpans('solidstart', spans => {
    segmentPaths.push(...spans.filter(span => span.is_segment).map(span => `${span.attributes[URL_PATH]?.value}`));
    return segmentPaths.includes(pagePath);
  });

  await fetch(`${baseURL}${path}`);
  await fetch(`${baseURL}${pagePath}`);
  await pageSegmentPromise;

  return segmentPaths;
}
