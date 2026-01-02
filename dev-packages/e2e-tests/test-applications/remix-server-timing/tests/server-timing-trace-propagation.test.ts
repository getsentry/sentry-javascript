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

  // Extract the trace ID and span ID from the Server-Timing header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();

  const serverTimingTraceValue = sentryTraceMatch?.[1];
  const [serverTimingTraceId, serverTimingSpanId] = serverTimingTraceValue?.split('-') || [];
  expect(serverTimingTraceId).toBeDefined();
  expect(serverTimingTraceId).toHaveLength(32);
  expect(serverTimingSpanId).toBeDefined();
  expect(serverTimingSpanId).toHaveLength(16);

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/');

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  // Verify that the pageload transaction uses the trace ID from the Server-Timing header
  // This proves that the client correctly read and used the Server-Timing header for trace propagation
  expect(pageLoadTraceId).toEqual(serverTimingTraceId);

  // Verify that the pageload's parent_span_id matches the span_id from Server-Timing
  // This proves the client is continuing from the exact server span, not just using the trace_id
  expect(pageLoadParentSpanId).toEqual(serverTimingSpanId);
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

test('Test app does not render sentry-trace meta tags (precondition for Server-Timing tests)', async ({ page }) => {
  await page.goto('/');

  // Verify that NO sentry-trace meta tag is present
  // This confirms we are testing Server-Timing propagation, not meta tag propagation
  const sentryTraceMetaTag = await page.$('meta[name="sentry-trace"]');
  const baggageMetaTag = await page.$('meta[name="baggage"]');

  // Both should be null since we intentionally don't use meta tags in this test app
  expect(sentryTraceMetaTag).toBeNull();
  expect(baggageMetaTag).toBeNull();
});

test('Propagates baggage/DSC from server to client via Server-Timing header', async ({ page }) => {
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

  // Extract sentry-trace from Server-Timing header
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const sentryTraceValue = sentryTraceMatch?.[1];
  const [headerTraceId] = sentryTraceValue?.split('-') || [];

  // Extract baggage from Server-Timing header
  const baggageMatch = serverTimingHeader?.match(/baggage;desc="([^"]+)"/);
  expect(baggageMatch).toBeTruthy();

  // Baggage is URL-encoded in Server-Timing header
  const encodedBaggage = baggageMatch?.[1];
  const decodedBaggage = decodeURIComponent(encodedBaggage || '');

  // Parse baggage string into key-value pairs
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

  // Verify essential DSC fields are present in baggage
  expect(baggageEntries['sentry-environment']).toBeDefined();
  expect(baggageEntries['sentry-trace_id']).toBeDefined();
  expect(baggageEntries['sentry-public_key']).toBeDefined();

  // CRITICAL: The trace_id in baggage MUST match the trace_id in sentry-trace header
  // Both are generated from the same span in generateSentryServerTimingHeader()
  // If they differ, there's a bug in DSC/trace context handling
  expect(baggageEntries['sentry-trace_id']).toEqual(headerTraceId);

  const pageloadTransaction = await pageLoadTransactionPromise;

  // Verify the client transaction uses the trace_id from sentry-trace header
  expect(pageloadTransaction.contexts?.trace?.trace_id).toEqual(headerTraceId);
});

test('Client pageload continues server trace with correct parent span ID', async ({ page }) => {
  // This test verifies the complete trace chain:
  // 1. Server generates Server-Timing header with trace_id and span_id
  // 2. Client receives and parses the header
  // 3. Client pageload transaction uses the same trace_id
  // 4. Client pageload's parent_span_id matches the server's span_id
  //
  // Note: We verify trace continuity via the Server-Timing header rather than
  // waiting for the server transaction, as the header is the propagation mechanism.

  const testTag = crypto.randomUUID();

  const responsePromise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

  const clientTransactionPromise = waitForTransaction('remix-server-timing', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  await page.goto(`/?tag=${testTag}`);

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  // Extract trace info from Server-Timing header (this represents the server span)
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const serverTimingTraceValue = sentryTraceMatch?.[1];
  const [serverTraceId, serverSpanId, sampled] = serverTimingTraceValue?.split('-') || [];

  // Verify server trace info is valid
  expect(serverTraceId).toBeDefined();
  expect(serverTraceId).toHaveLength(32);
  expect(serverSpanId).toBeDefined();
  expect(serverSpanId).toHaveLength(16);
  expect(sampled).toBe('1'); // Should be sampled

  const clientTransaction = await clientTransactionPromise;

  // Verify client transaction
  expect(clientTransaction).toBeDefined();
  const clientTraceId = clientTransaction.contexts?.trace?.trace_id;
  const clientParentSpanId = clientTransaction.contexts?.trace?.parent_span_id;

  // CRITICAL: Client trace_id must match server trace_id
  // This proves trace propagation worked
  expect(clientTraceId).toEqual(serverTraceId);

  // CRITICAL: Client's parent_span_id must match the server's span_id
  // This proves the client is continuing from the exact server span that sent the header
  expect(clientParentSpanId).toEqual(serverSpanId);
});
