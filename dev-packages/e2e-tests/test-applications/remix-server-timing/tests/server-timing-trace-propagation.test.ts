import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

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

test('Propagates trace context from Server-Timing header to client pageload (without meta tags)', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  // First, check that the Server-Timing header is being sent correctly
  const responsePromise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

  const pageLoadTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  await page.goto(`/?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Verify Server-Timing header is present and contains sentry-trace
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  // Extract the trace ID from the Server-Timing header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();

  const serverTimingTraceValue = sentryTraceMatch?.[1];
  const serverTimingTraceId = serverTimingTraceValue?.split('-')[0];
  expect(serverTimingTraceId).toBeDefined();
  expect(serverTimingTraceId).toHaveLength(32);

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/');

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  // Verify that the pageload transaction uses the trace ID from the Server-Timing header
  // This proves that the client correctly read and used the Server-Timing header for trace propagation
  expect(pageLoadTraceId).toEqual(serverTimingTraceId);

  // Verify that the pageload has a parent span (indicating it's continuing a trace, not starting a new one)
  expect(pageLoadParentSpanId).toBeDefined();
});

test('Propagates trace context via Server-Timing for parameterized routes', async ({ page }) => {
  const testTag = crypto.randomUUID();

  // Capture the Server-Timing header from the response
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes(`/user/789`) && response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

  const pageLoadTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.transaction === '/user/:id' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
  });

  // Navigate directly to parameterized route with a tag
  // The tag is set in both loader (server) and useEffect (client)
  await page.goto(`/user/789?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Verify Server-Timing header is present
  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');

  // Extract trace ID from Server-Timing header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  const serverTimingTraceValue = sentryTraceMatch?.[1];
  const serverTimingTraceId = serverTimingTraceValue?.split('-')[0];

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/user/:id');

  // Verify trace ID propagation from Server-Timing to client
  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  expect(pageLoadTraceId).toBeDefined();
  expect(pageLoadTraceId).toEqual(serverTimingTraceId);
});

test('No sentry-trace meta tag is present (testing Server-Timing-only propagation)', async ({ page }) => {
  await page.goto('/');

  // Verify that NO sentry-trace meta tag is present
  // This confirms we are testing Server-Timing propagation, not meta tag propagation
  const sentryTraceMetaTag = await page.$('meta[name="sentry-trace"]');
  const baggageMetaTag = await page.$('meta[name="baggage"]');

  // Both should be null since we intentionally don't use meta tags in this test app
  expect(sentryTraceMetaTag).toBeNull();
  expect(baggageMetaTag).toBeNull();
});
