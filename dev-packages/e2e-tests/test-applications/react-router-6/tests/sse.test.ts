import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Under span streaming the http.client name is only `<METHOD> <domain>`, so the request URL has to
// come from the `url.full` attribute.
function findHttpClientSpan(spans: SerializedStreamedSpan[], op: string, urlFull: string): SerializedStreamedSpan {
  return spans.find(span => getSpanOp(span) === op && span.attributes['url.full']?.value === urlFull)!;
}

function durationInSeconds(span: SerializedStreamedSpan): number {
  return Math.round(span.end_timestamp - span.start_timestamp);
}

test('Waits for sse streaming when creating spans', async ({ page }) => {
  await page.goto('/sse');

  const spansPromise = collectStreamedSpans('react-router-6', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  const fetchButton = page.locator('id=fetch-button');
  await fetchButton.click();

  const spans = await spansPromise;

  const sseFetchCall = spans.find(span => span.name === 'sse fetch call')!;
  const httpGet = findHttpClientSpan(spans, 'http.client', 'http://localhost:8080/sse');
  const httpStream = findHttpClientSpan(spans, 'http.client.stream', 'http://localhost:8080/sse');

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();
  expect(httpStream).toBeDefined();

  // http headers get sent instantly from the server
  // http.client span ends at header arrival (~0s), body streaming duration is captured in the
  // sibling http.client.stream span (~2s)
  expect(durationInSeconds(sseFetchCall)).toBe(0);
  expect(durationInSeconds(httpGet)).toBe(0);
  expect(durationInSeconds(httpStream)).toBe(2);
});

test('Waits for sse streaming when sse has been explicitly aborted', async ({ page }) => {
  await page.goto('/sse');

  const consoleMessages: string[] = [];
  page.on('console', msg => consoleMessages.push(msg.text()));

  const spansPromise = collectStreamedSpans('react-router-6', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  const fetchButton = page.locator('id=fetch-sse-abort');
  await fetchButton.click();

  const spans = await spansPromise;

  const sseFetchCall = spans.find(span => span.name === 'sse fetch call')!;
  const httpGet = findHttpClientSpan(spans, 'http.client', 'http://localhost:8080/sse');

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();

  // http headers get sent instantly from the server, and the body streams after 0s because it has
  // been aborted
  expect(durationInSeconds(sseFetchCall)).toBe(0);
  expect(durationInSeconds(httpGet)).toBe(0);

  // Spans carry no breadcrumbs, so the abort error is validated on the console directly
  expect(
    consoleMessages.some(
      message => message.includes('Could not fetch sse') && message.includes('BodyStreamBuffer was aborted'),
    ),
  ).toBe(true);
});

test('Aborts when stream takes longer than 5s, by not updating the span duration', async ({ page }) => {
  await page.goto('/sse');

  const spansPromise = collectStreamedSpans('react-router-6', spans => {
    return spans.some(span => getSpanOp(span) === 'pageload' && span.is_segment);
  });

  const fetchButton = page.locator('id=fetch-timeout-button');
  await fetchButton.click();

  const spans = await spansPromise;

  const sseFetchCall = spans.find(span => span.name === 'sse fetch call')!;
  const httpGet = findHttpClientSpan(spans, 'http.client', 'http://localhost:8080/sse-timeout');

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();

  // http headers get sent instantly from the server, and the body streams after 10s but the client
  // aborts reading after 5s
  expect(durationInSeconds(sseFetchCall)).toBe(0);
  expect(durationInSeconds(httpGet)).toBe(0);
});
