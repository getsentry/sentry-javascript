import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

function sentryMetaTagNames(html: string): string[] {
  return [...html.matchAll(/<meta name="(sentry-[\w-]+|baggage)"/g)].map(match => match[1] ?? '');
}

[
  { path: '/prerendered', kind: 'a prerendered page', expected: ['sentry-cache-origin'] },
  { path: '/prerendered-shell', kind: 'a prerendered client-side shell', expected: [] },
  { path: '/', kind: 'a server-rendered page', expected: ['sentry-trace', 'baggage'] },
].forEach(({ path, kind, expected }) => {
  test(`writes the expected Sentry meta tags into ${kind} (${path})`, async ({ request }) => {
    const html = await (await request.get(path)).text();

    expect(sentryMetaTagNames(html)).toEqual(expected);
  });
});

test('marks the pageload of a prerendered page as statically rendered, without a link', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/prerendered' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/prerendered');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.['page.server_rendering.type']).toEqual({ type: 'string', value: 'static' });
  expect(pageloadSpan.links).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toBeUndefined();
});

test("doesn't mark the pageload of a prerendered client-side shell", async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/prerendered-shell' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/prerendered-shell');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.['page.server_rendering.type']).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toBeUndefined();
});

test("doesn't mark the pageload of a server-rendered page, which continues the server trace", async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/' && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await page.goto('/');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.['page.server_rendering.type']).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toMatch(/^[a-f0-9]{16}$/);
});
