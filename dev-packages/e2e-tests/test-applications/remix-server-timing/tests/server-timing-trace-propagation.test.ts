import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('propagates trace context from server-timing header to client pageload', async ({ page }) => {
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

  expect(serverTimingHeader).toBeDefined();
  expect(serverTimingHeader).toContain('sentry-trace');
  expect(serverTimingHeader).toContain('baggage');

  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const [headerTraceId, headerSpanId, headerSampled] = sentryTraceMatch?.[1]?.split('-') || [];

  expect(headerTraceId).toHaveLength(32);
  expect(headerSpanId).toHaveLength(16);
  expect(headerSampled).toBe('1');

  const pageloadTransaction = await pageLoadTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(pageloadTransaction.transaction).toBe('/');

  expect(pageloadTransaction.contexts?.trace?.trace_id).toEqual(headerTraceId);
  expect(pageloadTransaction.contexts?.trace?.parent_span_id).toEqual(headerSpanId);
});

test('includes server-timing header on redirect responses', async ({ page }) => {
  const redirectResponsePromise = page.waitForResponse(response => response.url().includes('/redirect-test'));

  await page.goto('/redirect-test');

  const redirectResponse = await redirectResponsePromise;
  const serverTimingHeader = redirectResponse.headers()['server-timing'];

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

test('excludes server-timing header from client-side navigation data fetches', async ({ page }) => {
  await page.goto('/');
  await page.locator('#navigation').waitFor({ state: 'visible' });

  const navDataFetchPromise = page.waitForResponse(
    response =>
      response.url().includes('/user/123') && (response.url().includes('_data=') || response.url().endsWith('.data')),
  );
  await page.click('#navigation');
  const navDataFetch = await navDataFetchPromise;
  expect(navDataFetch.headers()['server-timing']).toBeUndefined();
});
