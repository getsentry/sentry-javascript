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

  expect(sseFetchCall).not.toBeUndefined();
  expect(httpGet).not.toBeUndefined();

  expect(sseFetchCall?.timestamp).not.toBeUndefined();
  expect(sseFetchCall?.start_timestamp).not.toBeUndefined();
  expect(httpGet?.timestamp).not.toBeUndefined();
  expect(httpGet?.start_timestamp).not.toBeUndefined();

  // http headers get sent instantly from the server
  const resolveDuration = Math.round((sseFetchCall.timestamp as number) - sseFetchCall.start_timestamp);

  // body streams after 2s
  const resolveBodyDuration = Math.round((httpGet.timestamp as number) - httpGet.start_timestamp);

  expect(resolveDuration).toBe(0);
  expect(resolveBodyDuration).toBe(2);
});
