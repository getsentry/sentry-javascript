import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

// =============================================================================
// BASIC FUNCTIONALITY TESTS
// =============================================================================

test('Sends pageload transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.contexts?.trace?.op).toBe('pageload');
});

test('Sends navigation transaction to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'navigation' && transactionEvent.transaction === '/user/:id';
  });

  await page.goto('/');

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionEvent = await transactionPromise;

  expect(transactionEvent).toBeDefined();
  expect(transactionEvent.contexts?.trace?.op).toBe('navigation');
});

test('Test app does not render sentry-trace meta tags (precondition)', async ({ page }) => {
  // This confirms we are testing Server-Timing propagation, not meta tag propagation
  await page.goto('/');

  const sentryTraceMetaTag = await page.$('meta[name="sentry-trace"]');
  const baggageMetaTag = await page.$('meta[name="baggage"]');

  expect(sentryTraceMetaTag).toBeNull();
  expect(baggageMetaTag).toBeNull();
});

// =============================================================================
// CORE TRACE PROPAGATION TEST
// This is the main test that verifies end-to-end trace propagation works
// =============================================================================

test('Propagates trace context from Server-Timing header to client pageload', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

  const pageLoadTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  await page.goto(`/?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Verify Server-Timing header format
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  // Extract trace info from header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const [headerTraceId, headerSpanId, headerSampled] = sentryTraceMatch?.[1]?.split('-') || [];

  expect(headerTraceId).toHaveLength(32);
  expect(headerSpanId).toHaveLength(16);
  expect(headerSampled).toBe('1');

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/');

  // CRITICAL: Verify trace propagation worked
  expect(pageloadTransaction.contexts?.trace?.trace_id).toEqual(headerTraceId);
  expect(pageloadTransaction.contexts?.trace?.parent_span_id).toEqual(headerSpanId);
});

// =============================================================================
// DSC/BAGGAGE VERIFICATION
// =============================================================================

test('DSC fields in baggage are complete, valid, and consistent with sentry-trace', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

  await page.goto(`/?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Extract trace_id from sentry-trace header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const headerTraceId = sentryTraceMatch?.[1]?.split('-')[0];

  // Extract and decode baggage
  const baggageMatch = serverTimingHeader?.match(/baggage;desc="([^"]+)"/);
  expect(baggageMatch).toBeTruthy();

  const decodedBaggage = decodeURIComponent(baggageMatch?.[1] || '');
  const baggageEntries = decodedBaggage.split(',').reduce(
    (acc, entry) => {
      const [key, value] = entry.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  // Verify essential DSC fields
  expect(baggageEntries['sentry-trace_id']).toHaveLength(32);
  expect(baggageEntries['sentry-environment']).toBe('qa');
  expect(baggageEntries['sentry-public_key']).toBeDefined();

  // Verify sampling info present
  const hasSamplingInfo =
    baggageEntries['sentry-sample_rate'] !== undefined || baggageEntries['sentry-sampled'] !== undefined;
  expect(hasSamplingInfo).toBe(true);

  // CRITICAL: Baggage trace_id must match sentry-trace header trace_id
  // This is a regression test for the DSC trace_id mismatch bug
  expect(baggageEntries['sentry-trace_id']).toEqual(headerTraceId);
});

// =============================================================================
// RESPONSE TYPE TESTS - Where Server-Timing IS expected
// =============================================================================

test('Server-Timing header is present on parameterized routes', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes(`/user/789`) && response.url().includes(`tag=${testTag}`),
  );

  await page.goto(`/user/789?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const [traceId, spanId] = sentryTraceMatch?.[1]?.split('-') || [];
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);
});

test('Server-Timing header merges with existing Server-Timing entries', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes('/merge-test') && response.url().includes(`tag=${testTag}`),
  );

  await page.goto(`/merge-test?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();

  // Verify original entries are preserved
  expect(serverTimingHeader).toContain('db;dur=53.2');
  expect(serverTimingHeader).toContain('cache');

  // Verify Sentry entries are also present
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});

test('Server-Timing header is present on error responses', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes('/error-test') && response.url().includes(`tag=${testTag}`),
  );

  await page.goto(`/error-test?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Server-Timing header should be present on error responses
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const [traceId, spanId] = sentryTraceMatch![1].split('-');
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);

  await expect(page.locator('h1')).toContainText('Error');
});

test('Single Fetch streaming (modern pattern) propagates trace context to client pageload', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes('/streaming') &&
      !response.url().includes('/streaming-legacy') &&
      response.url().includes(`tag=${testTag}`),
  );

  const pageLoadTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/streaming';
  });

  await page.goto(`/streaming?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Verify header format
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const [headerTraceId, headerSpanId] = sentryTraceMatch?.[1]?.split('-') || [];
  expect(headerTraceId).toHaveLength(32);
  expect(headerSpanId).toHaveLength(16);

  // Verify deferred content renders with Single Fetch
  await expect(page.locator('h1')).toContainText('Single Fetch Streaming');
  await expect(page.locator('text=Deferred message:')).toBeVisible({ timeout: 5000 });

  // CRITICAL: Verify trace propagation worked for streaming response
  const pageloadTransaction = await pageLoadTransactionPromise;
  expect(pageloadTransaction.contexts?.trace?.trace_id).toEqual(headerTraceId);
  expect(pageloadTransaction.contexts?.trace?.parent_span_id).toEqual(headerSpanId);
});

test('Legacy defer() streaming propagates trace context to client pageload', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes('/streaming-legacy') && response.url().includes(`tag=${testTag}`),
  );

  const pageLoadTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/streaming-legacy';
  });

  await page.goto(`/streaming-legacy?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Verify header format
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const [headerTraceId, headerSpanId] = sentryTraceMatch?.[1]?.split('-') || [];
  expect(headerTraceId).toHaveLength(32);
  expect(headerSpanId).toHaveLength(16);

  // Verify deferred content renders with legacy defer()
  await expect(page.locator('h1')).toContainText('Legacy Streaming');
  await expect(page.locator('text=Deferred message:')).toBeVisible({ timeout: 5000 });

  // CRITICAL: Verify trace propagation worked for streaming response
  const pageloadTransaction = await pageLoadTransactionPromise;
  expect(pageloadTransaction.contexts?.trace?.trace_id).toEqual(headerTraceId);
  expect(pageloadTransaction.contexts?.trace?.parent_span_id).toEqual(headerSpanId);
});

test('Server-Timing header is present on redirect responses', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const redirectResponsePromise = page.waitForResponse(
    response => response.url().includes('/redirect-test') && response.url().includes(`tag=${testTag}`),
  );

  page.goto(`/redirect-test?tag=${testTag}`);

  const redirectResponse = await redirectResponsePromise;
  const serverTimingHeader = redirectResponse.headers()['server-timing'];

  // Server-Timing header should be present on redirect responses
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const [traceId, spanId] = sentryTraceMatch![1].split('-');
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);

  await page.waitForURL(/\/user\/redirected/);
  await expect(page.locator('h1')).toContainText('User redirected');
});

test('Server-Timing header is present on nested routes', async ({ page }) => {
  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes('/parent/child') && response.url().includes(`tag=${testTag}`),
  );

  await page.goto(`/parent/child?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const [traceId, spanId] = sentryTraceMatch?.[1]?.split('-') || [];
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);

  // Verify both parent and child rendered
  await expect(page.locator('h1')).toContainText('Parent Route');
  await expect(page.locator('h2')).toContainText('Child Route');
});

// =============================================================================
// DATA FETCH TESTS - Where Server-Timing is NOT expected
// Server-Timing is only injected for document requests, not data fetches
// =============================================================================

test('Data fetches do not include Server-Timing headers', async ({ page, context }) => {
  // Server-Timing headers are only injected for document requests (HTML responses)
  // because the Performance API can only read them from the initial document load.
  // Data fetches (JSON responses) don't need Server-Timing since there's no
  // Performance API context to read them from.

  const testTag = crypto.randomUUID();

  // Test 1: Resource route (JSON API)
  const apiResponse = await page.request.get(`/api/data?tag=${testTag}`);
  expect(apiResponse.status()).toBe(200);
  expect(apiResponse.headers()['server-timing']).toBeUndefined();

  // Test 2: Client-side navigation data fetch
  // Single Fetch uses .data suffix, old format uses ?_data= query param
  await page.goto(`/?tag=${testTag}`);
  await page.locator('#navigation').waitFor({ state: 'visible' });

  const navDataFetchPromise = page.waitForResponse(
    response =>
      response.url().includes('/user/123') && (response.url().includes('_data=') || response.url().endsWith('.data')),
  );
  await page.click('#navigation');
  const navDataFetch = await navDataFetchPromise;
  expect(navDataFetch.headers()['server-timing']).toBeUndefined();

  // Test 3: Action (POST) data fetch
  const page2 = await context.newPage();
  await page2.goto(`/action-test?tag=${testTag}`);

  const actionDataFetchPromise = page2.waitForResponse(
    response => response.url().includes('/action-test') && response.request().method() === 'POST',
  );
  await page2.click('button[type="submit"]');
  const actionDataFetch = await actionDataFetchPromise;
  expect(actionDataFetch.headers()['server-timing']).toBeUndefined();
  await page2.close();

  // Test 4: Prefetch data fetch
  // Single Fetch uses .data suffix, old format uses ?_data= query param
  const page3 = await context.newPage();
  const prefetchResponses: (string | undefined)[] = [];
  page3.on('response', response => {
    const url = response.url();
    const isDataFetch = url.includes('_data=') || url.endsWith('.data');
    if (isDataFetch && url.includes('prefetch-target')) {
      prefetchResponses.push(response.headers()['server-timing']);
    }
  });

  await page3.goto(`/prefetch-test?tag=${testTag}`);
  await expect(page3.locator('h1')).toContainText('Prefetch Test');
  await page3.waitForTimeout(500);

  for (const serverTiming of prefetchResponses) {
    expect(serverTiming).toBeUndefined();
  }
  await page3.close();
});

// =============================================================================
// TRACE ISOLATION TESTS
// =============================================================================

test('Concurrent requests have isolated trace contexts', async ({ page, context }) => {
  const testTag1 = crypto.randomUUID();
  const testTag2 = crypto.randomUUID();

  const page2 = await context.newPage();

  const response1Promise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag1}`) && response.status() === 200,
  );
  const response2Promise = page2.waitForResponse(
    response => response.url().includes(`tag=${testTag2}`) && response.status() === 200,
  );

  await Promise.all([page.goto(`/?tag=${testTag1}`), page2.goto(`/?tag=${testTag2}`)]);

  const [response1, response2] = await Promise.all([response1Promise, response2Promise]);

  const match1 = response1.headers()['server-timing']?.match(/sentry-trace;desc="([^"]+)"/);
  const match2 = response2.headers()['server-timing']?.match(/sentry-trace;desc="([^"]+)"/);

  const traceId1 = match1?.[1]?.split('-')[0];
  const traceId2 = match2?.[1]?.split('-')[0];

  expect(traceId1).toHaveLength(32);
  expect(traceId2).toHaveLength(32);
  expect(traceId1).not.toEqual(traceId2);

  await page2.close();
});

test('Sequential pageloads get fresh trace IDs', async ({ page }) => {
  const testTag1 = crypto.randomUUID();
  const testTag2 = crypto.randomUUID();

  // First pageload
  const response1Promise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag1}`) && response.status() === 200,
  );
  await page.goto(`/?tag=${testTag1}`);
  const response1 = await response1Promise;

  // Second pageload
  const response2Promise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag2}`) && response.status() === 200,
  );
  await page.goto(`/user/sequential?tag=${testTag2}`);
  const response2 = await response2Promise;

  const match1 = response1.headers()['server-timing']?.match(/sentry-trace;desc="([^"]+)"/);
  const match2 = response2.headers()['server-timing']?.match(/sentry-trace;desc="([^"]+)"/);

  const traceId1 = match1?.[1]?.split('-')[0];
  const traceId2 = match2?.[1]?.split('-')[0];

  expect(traceId1).toHaveLength(32);
  expect(traceId2).toHaveLength(32);
  expect(traceId1).not.toEqual(traceId2);
});
