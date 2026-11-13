import { expect, test, type Page } from '@playwright/test';
import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test.describe('Rendering Modes with Cached HTML', () => {
  test('changes tracing meta tags with multiple requests on Client-Side only page', async ({ page }) => {
    await testChangingTracingMetaTagsOnISRPage(page, '/rendering-modes/client-side-only-page', 'Client Side Only Page');
  });

  test('changes tracing meta tags with multiple requests on ISR-cached page', async ({ page }) => {
    await testChangingTracingMetaTagsOnISRPage(page, '/rendering-modes/isr-cached-page', 'ISR Cached Page');
  });

  test('changes tracing meta tags with multiple requests on 1h ISR-cached page', async ({ page }) => {
    await testChangingTracingMetaTagsOnISRPage(page, '/rendering-modes/isr-1h-cached-page', 'ISR 1h Cached Page');
  });

  test('links the render as cache origin on SWR-cached page', async ({ page }) => {
    await testCacheOriginOnRuntimeCachedPage(page, '/rendering-modes/swr-cached-page', 'SWR Cached Page');
  });

  test('links the render as cache origin on SWR 1h cached page', async ({ page }) => {
    await testCacheOriginOnRuntimeCachedPage(page, '/rendering-modes/swr-1h-cached-page', 'SWR 1h Cached Page');
  });

  test('marks pageloads of pre-rendered page as static without a cache origin link', async ({ page }) => {
    await testEmptyCacheOriginOnPrerenderedPage(page, '/rendering-modes/pre-rendered-page', 'Pre-Rendered Page');
  });
});

// Cached pages have exact-match routes, so the server segment is selected by `url.path` instead of
// its name (route matching may or may not rename exact-match segments under span streaming).
function waitForServerSegment(routePath: string) {
  return waitForStreamedSpan('nuxt-5', span => {
    return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === routePath;
  });
}

function waitForPageloadSegment(routePath: string) {
  return waitForStreamedSpan('nuxt-5', span => {
    return span.is_segment && getSpanOp(span) === 'pageload' && span.attributes['url.path']?.value === routePath;
  });
}

/**
 * Tests that tracing meta-tags change with multiple requests on ISR-cached pages
 * This utility handles the common pattern of:
 * 1. Making two requests to an ISR-cached page
 * 2. Verifying tracing meta-tags are present and change between requests
 * 3. Verifying distributed tracing works correctly for both requests
 * 4. Verifying trace IDs are different between requests
 *
 * @param page - Playwright page object
 * @param routePath - The route path to test (e.g., '/rendering-modes/isr-cached-page')
 * @param expectedPageText - The text to verify is visible on the page (e.g., 'ISR Cached Page')
 */
export async function testChangingTracingMetaTagsOnISRPage(
  page: Page,
  routePath: string,
  expectedPageText: string,
): Promise<void> {
  // === 1. Request ===
  const clientSpanPromise1 = waitForPageloadSegment(routePath);
  const serverSpanPromise1 = waitForServerSegment(routePath);

  const [_1, clientSpan1, serverSpan1] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise1,
    serverSpanPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  await expect(page.locator('meta[name="baggage"]')).toHaveCount(1);
  const baggageMetaTagContent1 = await page.locator('meta[name="baggage"]').getAttribute('content');
  const sentryTraceMetaTagContent1 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
  const [htmlMetaTraceId1] = sentryTraceMetaTagContent1?.split('-') || [];

  // === 2. Request ===

  const clientSpanPromise2 = waitForPageloadSegment(routePath);
  const serverSpanPromise2 = waitForServerSegment(routePath);

  const [_2, clientSpan2, serverSpan2] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise2,
    serverSpanPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  await expect(page.locator('meta[name="baggage"]')).toHaveCount(1);
  const baggageMetaTagContent2 = await page.locator('meta[name="baggage"]').getAttribute('content');
  const sentryTraceMetaTagContent2 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
  const [htmlMetaTraceId2] = sentryTraceMetaTagContent2?.split('-') || [];

  const serverSpan1TraceId = serverSpan1.trace_id;
  const serverSpan2TraceId = serverSpan2.trace_id;

  await test.step('Test distributed trace from 1. request', () => {
    expect(baggageMetaTagContent1).toContain(`sentry-trace_id=${serverSpan1TraceId}`);

    expect(clientSpan1.trace_id).toBe(serverSpan1TraceId);
    expect(clientSpan1.parent_span_id).toBe(serverSpan1.span_id);
    expect(serverSpan1TraceId).toBe(htmlMetaTraceId1);
  });

  await test.step('Test distributed trace from 2. request', () => {
    expect(baggageMetaTagContent2).toContain(`sentry-trace_id=${serverSpan2TraceId}`);

    expect(clientSpan2.trace_id).toBe(serverSpan2TraceId);
    expect(clientSpan2.parent_span_id).toBe(serverSpan2.span_id);
    expect(serverSpan2TraceId).toBe(htmlMetaTraceId2);
  });

  await test.step('Test that trace IDs from subsequent requests are different', () => {
    // Different trace IDs for the server root spans
    expect(serverSpan1TraceId).toBeDefined();
    expect(serverSpan1TraceId).not.toBe(serverSpan2TraceId);
    expect(serverSpan1TraceId).not.toBe(htmlMetaTraceId2);
  });
}

async function getCacheOriginMetaTag(page: Page): Promise<string | null> {
  await expect(page.locator('meta[name="sentry-cache-origin"]')).toHaveCount(1);
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
  return page.locator('meta[name="sentry-cache-origin"]').getAttribute('content');
}

/**
 * Tests a page that a route rule caches at runtime. The cached HTML holds the `sentry-trace` value of
 * the render in a `sentry-cache-origin` tag. Every pageload starts its own trace, is static, and links
 * the render.
 */
export async function testCacheOriginOnRuntimeCachedPage(
  page: Page,
  routePath: string,
  expectedPageText: string,
): Promise<void> {
  // === 1. Request (renders and fills the cache) ===
  const clientSpanPromise1 = waitForPageloadSegment(routePath);
  const serverSpanPromise1 = waitForServerSegment(routePath);

  const [_1, clientSpan1, serverSpan1] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise1,
    serverSpanPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);
  const cacheOrigin1 = await getCacheOriginMetaTag(page);

  // === 2. Request (served from the cache) ===
  const clientSpanPromise2 = waitForPageloadSegment(routePath);

  const [_2, clientSpan2] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);
  const cacheOrigin2 = await getCacheOriginMetaTag(page);

  const [originTraceId, originSpanId, originSampled] = cacheOrigin1?.split('-') ?? [];
  const cacheOriginLink = {
    trace_id: serverSpan1.trace_id,
    span_id: originSpanId,
    sampled: true,
    attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'cache_origin' } },
  };

  await test.step('The cache origin tag holds the sampled render of the 1. request', () => {
    expect(originTraceId).toBe(serverSpan1.trace_id);
    expect(originSpanId).toMatch(/^[a-f0-9]{16}$/);
    expect(originSampled).toBe('1');
    expect(cacheOrigin2).toBe(cacheOrigin1);
  });

  await test.step('Every pageload starts its own trace', () => {
    expect(clientSpan1.parent_span_id).toBeUndefined();
    expect(clientSpan2.parent_span_id).toBeUndefined();
    expect(clientSpan1.trace_id).not.toBe(serverSpan1.trace_id);
    expect(clientSpan2.trace_id).not.toBe(serverSpan1.trace_id);
    expect(clientSpan1.trace_id).not.toBe(clientSpan2.trace_id);
  });

  await test.step('Every pageload is static and links the render', () => {
    expect(clientSpan1.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
    expect(clientSpan2.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
    expect(clientSpan1.links).toEqual([cacheOriginLink]);
    expect(clientSpan2.links).toEqual([cacheOriginLink]);
  });
}

/**
 * Tests a page that Nitro prerendered during the build. The SDK does not run in the build, so the
 * `sentry-cache-origin` tag is empty: every pageload starts its own trace and is static, without a link.
 */
export async function testEmptyCacheOriginOnPrerenderedPage(
  page: Page,
  routePath: string,
  expectedPageText: string,
): Promise<void> {
  const clientSpanPromise1 = waitForPageloadSegment(routePath);
  const [_1, clientSpan1] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);
  const cacheOrigin1 = await getCacheOriginMetaTag(page);

  const clientSpanPromise2 = waitForPageloadSegment(routePath);
  const [_2, clientSpan2] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);
  const cacheOrigin2 = await getCacheOriginMetaTag(page);

  expect(cacheOrigin1).toBe('');
  expect(cacheOrigin2).toBe('');
  expect(clientSpan1.parent_span_id).toBeUndefined();
  expect(clientSpan2.parent_span_id).toBeUndefined();
  expect(clientSpan1.trace_id).not.toBe(clientSpan2.trace_id);
  expect(clientSpan1.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
  expect(clientSpan2.attributes?.[PAGE_SERVER_RENDERING_TYPE]).toEqual({ type: 'string', value: 'static' });
  expect(clientSpan1.links).toBeUndefined();
  expect(clientSpan2.links).toBeUndefined();
}
