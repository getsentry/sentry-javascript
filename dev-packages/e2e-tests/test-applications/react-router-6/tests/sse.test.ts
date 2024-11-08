import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SpanJSON } from '@sentry/types';

test('Waits for sse streaming when creating spans', async ({ page }) => {
  await page.goto('/sse');

  const transactionPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const fetchButton = page.locator('id=fetch-button');
  await fetchButton.click();

  const rootSpan = await transactionPromise;
  const sseFetchCall = rootSpan.spans?.filter(span => span.description === 'sse fetch call')[0] as SpanJSON;
  const httpGet = rootSpan.spans?.filter(span => span.description === 'GET http://localhost:8080/sse')[0] as SpanJSON;

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();

  expect(sseFetchCall?.timestamp).toBeDefined();
  expect(sseFetchCall?.start_timestamp).toBeDefined();
  expect(httpGet?.timestamp).toBeDefined();
  expect(httpGet?.start_timestamp).toBeDefined();

  // http headers get sent instantly from the server
  const resolveDuration = Math.round((sseFetchCall.timestamp as number) - sseFetchCall.start_timestamp);

  // body streams after 2s
  const resolveBodyDuration = Math.round((httpGet.timestamp as number) - httpGet.start_timestamp);

  expect(resolveDuration).toBe(0);
  expect(resolveBodyDuration).toBe(2);
});

test('Waits for sse streaming when sse has been explicitly aborted', async ({ page }) => {
  await page.goto('/sse');

  const transactionPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const fetchButton = page.locator('id=fetch-sse-abort');
  await fetchButton.click();

  const rootSpan = await transactionPromise;
  const sseFetchCall = rootSpan.spans?.filter(span => span.description === 'sse fetch call')[0] as SpanJSON;
  const httpGet = rootSpan.spans?.filter(span => span.description === 'GET http://localhost:8080/sse')[0] as SpanJSON;

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();

  expect(sseFetchCall?.timestamp).toBeDefined();
  expect(sseFetchCall?.start_timestamp).toBeDefined();
  expect(httpGet?.timestamp).toBeDefined();
  expect(httpGet?.start_timestamp).toBeDefined();

  // http headers get sent instantly from the server
  const resolveDuration = Math.round((sseFetchCall.timestamp as number) - sseFetchCall.start_timestamp);

  // body streams after 0s because it has been aborted
  const resolveBodyDuration = Math.round((httpGet.timestamp as number) - httpGet.start_timestamp);

  expect(resolveDuration).toBe(0);
  expect(resolveBodyDuration).toBe(0);

  // validate abort error was thrown by inspecting console
  expect(rootSpan.breadcrumbs).toContainEqual(
    expect.objectContaining({
      category: 'console',
      message: 'Could not fetch sse AbortError: BodyStreamBuffer was aborted',
    }),
  );
});

test('Aborts when stream takes longer than 5s, by not updating the span duration', async ({ page }) => {
  await page.goto('/sse');

  const transactionPromise = waitForTransaction('react-router-6', async transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  const fetchButton = page.locator('id=fetch-timeout-button');
  await fetchButton.click();

  const rootSpan = await transactionPromise;
  const sseFetchCall = rootSpan.spans?.filter(span => span.description === 'sse fetch call')[0] as SpanJSON;
  const httpGet = rootSpan.spans?.filter(
    span => span.description === 'GET http://localhost:8080/sse-timeout',
  )[0] as SpanJSON;

  expect(sseFetchCall).toBeDefined();
  expect(httpGet).toBeDefined();

  expect(sseFetchCall?.timestamp).toBeDefined();
  expect(sseFetchCall?.start_timestamp).toBeDefined();
  expect(httpGet?.timestamp).toBeDefined();
  expect(httpGet?.start_timestamp).toBeDefined();

  // http headers get sent instantly from the server
  const resolveDuration = Math.round((sseFetchCall.timestamp as number) - sseFetchCall.start_timestamp);

  // body streams after 10s but client should abort reading after 5s
  const resolveBodyDuration = Math.round((httpGet.timestamp as number) - httpGet.start_timestamp);

  expect(resolveDuration).toBe(0);
  expect(resolveBodyDuration).toBe(0);
});
