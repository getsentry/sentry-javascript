import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('Server-Timing header contains sentry-trace on page load (Cloudflare)', async ({ page }) => {
  // Intercept the document response (not data requests or other resources)
  const responsePromise = page.waitForResponse(
    response =>
      response.url().endsWith('/') && response.status() === 200 && response.request().resourceType() === 'document',
  );

  await page.goto('/');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');
});

test('Server-Timing header contains valid trace ID format (Cloudflare)', async ({ page }) => {
  // Match only the document response for /user/123 (not .data requests)
  const responsePromise = page.waitForResponse(
    response =>
      response.url().endsWith('/user/123') &&
      response.status() === 200 &&
      response.request().resourceType() === 'document',
  );

  await page.goto('/user/123');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();

  // Extract sentry-trace value from header
  // Format: sentry-trace;desc="traceid-spanid" or sentry-trace;desc="traceid-spanid-sampled"
  const sentryTraceMatch = serverTimingHeader.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();

  const sentryTraceValue = sentryTraceMatch![1];

  // Validate sentry-trace format: traceid-spanid or traceid-spanid-sampled (case insensitive)
  // The format is: 32 hex chars, dash, 16 hex chars, optionally followed by dash and 0 or 1
  const traceIdMatch = sentryTraceValue.match(/^([a-fA-F0-9]{32})-([a-fA-F0-9]{16})(?:-([01]))?$/);
  expect(traceIdMatch).toBeTruthy();

  // Verify the trace ID and span ID parts
  const [, traceId, spanId] = traceIdMatch!;
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);
});

test('Server-Timing header is present on parameterized routes (Cloudflare)', async ({ page }) => {
  // Match only the document response for /user/456 (not .data requests)
  const responsePromise = page.waitForResponse(
    response =>
      response.url().endsWith('/user/456') &&
      response.status() === 200 &&
      response.request().resourceType() === 'document',
  );

  await page.goto('/user/456');

  const response = await responsePromise;
  const serverTimingHeader = response.headers()['server-timing'];

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
});
