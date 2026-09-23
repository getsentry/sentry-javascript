import { expect, test, type Page } from '@playwright/test';
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

  test('exclude tracing meta tags on SWR-cached page', async ({ page }) => {
    await testExcludeTracingMetaTagsOnCachedPage(page, '/rendering-modes/swr-cached-page', 'SWR Cached Page');
  });

  test('exclude tracing meta tags on SWR 1h cached page', async ({ page }) => {
    await testExcludeTracingMetaTagsOnCachedPage(page, '/rendering-modes/swr-1h-cached-page', 'SWR 1h Cached Page');
  });

  test('exclude tracing meta tags on pre-rendered page', async ({ page }) => {
    await testExcludeTracingMetaTagsOnCachedPage(page, '/rendering-modes/pre-rendered-page', 'Pre-Rendered Page');
  });
});

// Cached pages have exact-match routes, so the server segment is selected by `url.path` instead of
// its name (route matching may or may not rename exact-match segments under span streaming).
function waitForServerSegment(routePath: string) {
  return waitForStreamedSpan('nuxt-4', span => {
    return span.is_segment && getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === routePath;
  });
}

function waitForPageloadSegment(routePath: string) {
  return waitForStreamedSpan('nuxt-4', span => {
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

/**
 * Tests that tracing meta-tags are excluded on cached pages (SWR, pre-rendered, etc.)
 * This utility handles the common pattern of:
 * 1. Making two requests to a cached page
 * 2. Verifying no tracing meta-tags are present
 * 3. Verifying traces are not distributed (each pageload starts its own trace)
 *
 * @param page - Playwright page object
 * @param routePath - The route path to test (e.g., '/rendering-modes/swr-cached-page')
 * @param expectedPageText - The text to verify is visible on the page (e.g., 'SWR Cached Page')
 */
export async function testExcludeTracingMetaTagsOnCachedPage(
  page: Page,
  routePath: string,
  expectedPageText: string,
): Promise<void> {
  // === 1. Request ===
  const clientSpanPromise1 = waitForPageloadSegment(routePath);

  // Only the 1. request creates a server root span
  const serverSpanPromise1 = waitForServerSegment(routePath);

  const [_1, clientSpan1, serverSpan1] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise1,
    serverSpanPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  // Verify no baggage and sentry-trace meta-tags are present on first request
  expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);

  // === 2. Request ===

  const clientSpanPromise2 = waitForPageloadSegment(routePath);

  const [_2, clientSpan2] = await Promise.all([
    page.goto(routePath),
    clientSpanPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  const clientSpan1TraceId = clientSpan1.trace_id;
  const clientSpan2TraceId = clientSpan2.trace_id;

  const serverSpan1TraceId = serverSpan1.trace_id;

  await test.step('No baggage and sentry-trace meta-tags are present on second request', async () => {
    expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
    expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  });

  await test.step('1. server root span and all client root spans are defined', () => {
    expect(serverSpan1TraceId).toBeDefined();
    expect(clientSpan1TraceId).toBeDefined();
    expect(clientSpan2TraceId).toBeDefined();
  });

  await test.step('Trace is not distributed', () => {
    // Cannot create distributed trace as HTML Meta Tags are not added (caching leads to multiple usages of the same server trace id)
    expect(clientSpan1TraceId).not.toBe(clientSpan2TraceId);
    expect(clientSpan1TraceId).not.toBe(serverSpan1TraceId);
    expect(clientSpan2TraceId).not.toBe(serverSpan1TraceId);
    // Without meta tags the pageloads have no parent and start their own traces
    expect(clientSpan1.parent_span_id).toBeUndefined();
    expect(clientSpan2.parent_span_id).toBeUndefined();
  });
}
