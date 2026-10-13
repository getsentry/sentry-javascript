import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

const APP_NAME = 'remix-server-timing';

test('propagates trace context from server-timing header to client pageload', async ({ page }) => {
  const testTag = crypto.randomUUID();

  // Streamed spans are buffered before they flush, so spans from an earlier page load can still be
  // arriving here. The `Server-Timing` header advertises this response's own trace, so that is what
  // tells this page load's spans apart rather than the op or the URL.
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  const responsePromise = page.waitForResponse(
    response => response.url().includes(`tag=${testTag}`) && response.status() === 200,
  );

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

  const findServerSegmentSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment && span.trace_id === headerTraceId);
  await expect.poll(findServerSegmentSpan).toBeDefined();
  // The index route has no path of its own, so the segment keeps the low-cardinality method-only
  // name it starts with.
  expect(findServerSegmentSpan()!.name).toBe('GET');
  expect(findServerSegmentSpan()!.span_id).toBe(headerSpanId);

  const findPageloadSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'pageload' && span.is_segment && span.trace_id === headerTraceId);
  await expect.poll(findPageloadSpan).toBeDefined();
  expect(findPageloadSpan()!.name).toBe('/');
  expect(findPageloadSpan()!.parent_span_id).toBe(headerSpanId);
});

test('includes server-timing header on redirect responses', async ({ page }) => {
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  const redirectResponsePromise = page.waitForResponse(response => response.url().includes('/redirect-test'));
  const redirectedPageloadResponsePromise = page.waitForResponse(response =>
    response.url().includes('/user/redirected'),
  );

  await page.goto('/redirect-test');

  const redirectResponse = await redirectResponsePromise;
  const redirectServerTimingHeader = redirectResponse.headers()['server-timing'];

  expect(redirectServerTimingHeader).toBeDefined();
  expect(redirectServerTimingHeader).toContain('sentry-trace');
  expect(redirectServerTimingHeader).toContain('baggage');

  const redirectSentryTraceMatch = redirectServerTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(redirectSentryTraceMatch).toBeTruthy();
  expect(redirectSentryTraceMatch![1]).toMatch(/[a-f0-9]{32}-[a-f0-9]{16}-1/);

  const redirectedPageloadResponse = await redirectedPageloadResponsePromise;

  const serverTimingHeader = redirectedPageloadResponse.headers()['server-timing'];
  const sentryTraceMatch = serverTimingHeader?.match(/sentry-trace;desc="([^"]+)"/);
  expect(sentryTraceMatch).toBeTruthy();
  const [traceId, spanId] = sentryTraceMatch![1].split('-');
  expect(traceId).toHaveLength(32);
  expect(spanId).toHaveLength(16);

  await page.waitForURL(/\/user\/redirected/);
  await expect(page.locator('h1')).toContainText('User redirected');

  const findPageloadSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'pageload' && span.is_segment && span.trace_id === traceId);
  await expect.poll(findPageloadSpan).toBeDefined();
  expect(findPageloadSpan()!.name).toBe('/user/:id');
  expect(findPageloadSpan()!.parent_span_id).toBe(spanId);
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
