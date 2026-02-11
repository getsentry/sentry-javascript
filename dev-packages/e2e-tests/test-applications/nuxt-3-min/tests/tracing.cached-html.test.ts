import { expect, test, type Page } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

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
  const clientTxnEventPromise1 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction === routePath;
  });

  const serverTxnEventPromise1 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction?.includes(`GET ${routePath}`) ?? false;
  });

  const [_1, clientTxnEvent1, serverTxnEvent1] = await Promise.all([
    page.goto(routePath),
    clientTxnEventPromise1,
    serverTxnEventPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  const baggageMetaTagContent1 = await page.locator('meta[name="baggage"]').getAttribute('content');
  const sentryTraceMetaTagContent1 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
  const [htmlMetaTraceId1] = sentryTraceMetaTagContent1?.split('-') || [];

  // === 2. Request ===

  const clientTxnEventPromise2 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction === routePath;
  });

  const serverTxnEventPromise2 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction?.includes(`GET ${routePath}`) ?? false;
  });

  const [_2, clientTxnEvent2, serverTxnEvent2] = await Promise.all([
    page.goto(routePath),
    clientTxnEventPromise2,
    serverTxnEventPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  const baggageMetaTagContent2 = await page.locator('meta[name="baggage"]').getAttribute('content');
  const sentryTraceMetaTagContent2 = await page.locator('meta[name="sentry-trace"]').getAttribute('content');
  const [htmlMetaTraceId2] = sentryTraceMetaTagContent2?.split('-') || [];

  const serverTxnEvent1TraceId = serverTxnEvent1.contexts?.trace?.trace_id;
  const serverTxnEvent2TraceId = serverTxnEvent2.contexts?.trace?.trace_id;

  await test.step('Test distributed trace from 1. request', () => {
    expect(baggageMetaTagContent1).toContain(`sentry-trace_id=${serverTxnEvent1TraceId}`);

    expect(clientTxnEvent1.contexts?.trace?.trace_id).toBe(serverTxnEvent1TraceId);
    expect(clientTxnEvent1.contexts?.trace?.parent_span_id).toBe(serverTxnEvent1.contexts?.trace?.span_id);
    expect(serverTxnEvent1.contexts?.trace?.trace_id).toBe(htmlMetaTraceId1);
  });

  await test.step('Test distributed trace from 2. request', () => {
    expect(baggageMetaTagContent2).toContain(`sentry-trace_id=${serverTxnEvent2TraceId}`);

    expect(clientTxnEvent2.contexts?.trace?.trace_id).toBe(serverTxnEvent2TraceId);
    expect(clientTxnEvent2.contexts?.trace?.parent_span_id).toBe(serverTxnEvent2.contexts?.trace?.span_id);
    expect(serverTxnEvent2.contexts?.trace?.trace_id).toBe(htmlMetaTraceId2);
  });

  await test.step('Test that trace IDs from subsequent requests are different', () => {
    // Different trace IDs for the server transactions
    expect(serverTxnEvent1TraceId).toBeDefined();
    expect(serverTxnEvent1TraceId).not.toBe(serverTxnEvent2TraceId);
    expect(serverTxnEvent1TraceId).not.toBe(htmlMetaTraceId2);
  });
}

/**
 * Tests that tracing meta-tags are excluded on cached pages (SWR, pre-rendered, etc.)
 * This utility handles the common pattern of:
 * 1. Making two requests to a cached page
 * 2. Verifying no tracing meta-tags are present
 * 3. Verifying only the first request creates a server transaction
 * 4. Verifying traces are not distributed
 *
 * @param page - Playwright page object
 * @param routePath - The route path to test (e.g., '/rendering-modes/swr-cached-page')
 * @param expectedPageText - The text to verify is visible on the page (e.g., 'SWR Cached Page')
 * @returns Object containing transaction events for additional custom assertions
 */
export async function testExcludeTracingMetaTagsOnCachedPage(
  page: Page,
  routePath: string,
  expectedPageText: string,
): Promise<void> {
  // === 1. Request ===
  const clientTxnEventPromise1 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction === routePath;
  });

  // Only the 1. request creates a server transaction
  const serverTxnEventPromise1 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction?.includes(`GET ${routePath}`) ?? false;
  });

  const [_1, clientTxnEvent1, serverTxnEvent1] = await Promise.all([
    page.goto(routePath),
    clientTxnEventPromise1,
    serverTxnEventPromise1,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  // Verify no baggage and sentry-trace meta-tags are present on first request
  expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);

  // === 2. Request ===

  await page.goto(routePath);

  const clientTxnEventPromise2 = waitForTransaction('nuxt-3-min', txnEvent => {
    return txnEvent.transaction === routePath;
  });

  let serverTxnEvent2 = undefined;
  const serverTxnEventPromise2 = Promise.race([
    waitForTransaction('nuxt-3-min', txnEvent => {
      return txnEvent.transaction?.includes(`GET ${routePath}`) ?? false;
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('No second server transaction expected')), 2000)),
  ]);

  try {
    serverTxnEvent2 = await serverTxnEventPromise2;
    throw new Error('Second server transaction should not have been sent');
  } catch (error) {
    expect(error.message).toBe('No second server transaction expected');
  }

  const [clientTxnEvent2] = await Promise.all([
    clientTxnEventPromise2,
    expect(page.getByText(expectedPageText, { exact: true })).toBeVisible(),
  ]);

  const clientTxnEvent1TraceId = clientTxnEvent1.contexts?.trace?.trace_id;
  const clientTxnEvent2TraceId = clientTxnEvent2.contexts?.trace?.trace_id;

  const serverTxnEvent1TraceId = serverTxnEvent1.contexts?.trace?.trace_id;
  const serverTxnEvent2TraceId = serverTxnEvent2?.contexts?.trace?.trace_id;

  await test.step('No baggage and sentry-trace meta-tags are present on second request', async () => {
    expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
    expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  });

  await test.step('1. Server Transaction and all Client Transactions are defined', () => {
    expect(serverTxnEvent1TraceId).toBeDefined();
    expect(clientTxnEvent1TraceId).toBeDefined();
    expect(clientTxnEvent2TraceId).toBeDefined();
    expect(serverTxnEvent2).toBeUndefined();
    expect(serverTxnEvent2TraceId).toBeUndefined();
  });

  await test.step('Trace is not distributed', () => {
    // Cannot create distributed trace as HTML Meta Tags are not added (caching leads to multiple usages of the same server trace id)
    expect(clientTxnEvent1TraceId).not.toBe(clientTxnEvent2TraceId);
    expect(clientTxnEvent1TraceId).not.toBe(serverTxnEvent1TraceId);
  });
}
