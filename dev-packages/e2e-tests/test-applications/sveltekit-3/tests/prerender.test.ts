import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';

function sentryMetaTagNames(html: string): string[] {
  return [...html.matchAll(/<meta name="(sentry-[\w-]+|baggage)"/g)].map(match => match[1] ?? '');
}

const VERCEL_ISR_HEADERS = { 'x-vercel-isr': '1' };

[
  { path: '/prerendered', kind: 'a prerendered page', expected: ['sentry-cache-origin'] },
  { path: '/prerendered-shell', kind: 'a prerendered client-side shell', expected: [] },
  { path: '/', kind: 'a server-rendered page', expected: ['sentry-trace', 'baggage'] },
  { path: '/', headers: VERCEL_ISR_HEADERS, kind: 'a Vercel ISR render', expected: ['sentry-cache-origin'] },
].forEach(({ path, headers, kind, expected }) => {
  test(`writes the expected Sentry meta tags into ${kind} (${path})`, async ({ request }) => {
    const html = await (await request.get(path, { headers })).text();

    expect(sentryMetaTagNames(html)).toEqual(expected);
  });
});

test('marks the pageload of a prerendered page as statically rendered, without a link', async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/prerendered' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/prerendered');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
  expect(pageloadSpan.links).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toBeUndefined();
});

test("doesn't mark the pageload of a prerendered client-side shell", async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/prerendered-shell' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/prerendered-shell');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toBeUndefined();
});

test("doesn't mark the pageload of a server-rendered page, which continues the server trace", async ({ page }) => {
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/');
  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toBeUndefined();
  expect(pageloadSpan.parent_span_id).toMatch(/^[a-f0-9]{16}$/);
});

test('marks the pageload of a Vercel ISR page as statically rendered and links the render', async ({ page }) => {
  // The event proxy replays spans from this time on, so the server span of the render can be awaited
  // after its trace id is known from the HTML. Same clock as the proxy (`process.hrtime`).
  const [seconds, nanoseconds] = process.hrtime();
  const requestStart = seconds * 1e9 + nanoseconds;
  const pageloadSpanPromise = waitForStreamedSpan('sveltekit-3', span => {
    return span.name === '/' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  // Only on the document: on the SDK's cross-origin envelope requests, the header would need a preflight.
  await page.route(
    url => url.pathname === '/',
    route => route.continue({ headers: { ...route.request().headers(), ...VERCEL_ISR_HEADERS } }),
  );
  await page.goto('/');
  const cacheOrigin = await page.locator('meta[name="sentry-cache-origin"]').getAttribute('content');
  const [originTraceId, originSpanId] = cacheOrigin?.split('-') ?? [];
  const [originSpan, pageloadSpan] = await Promise.all([
    waitForStreamedSpan('sveltekit-3', span => span.span_id === originSpanId, requestStart),
    pageloadSpanPromise,
  ]);

  expect(originSpan.trace_id).toBe(originTraceId);
  expect(getSpanOp(originSpan)).toBe(HTTP_SERVER);
  expect(originSpan.is_segment).toBe(true);
  expect(pageloadSpan.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
  expect(pageloadSpan.parent_span_id).toBeUndefined();
  expect(pageloadSpan.trace_id).not.toBe(originTraceId);
  expect(pageloadSpan.links).toEqual([
    {
      trace_id: originTraceId,
      span_id: originSpanId,
      sampled: true,
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'cache_origin' } },
    },
  ]);
});
