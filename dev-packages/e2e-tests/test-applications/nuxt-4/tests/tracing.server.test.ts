import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nuxt';

test('sends a server action transaction on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return transactionEvent.transaction.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const transaction = await transactionPromise;

  expect(transaction.contexts.trace).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.http',
      }),
    }),
  );
});

test('does not send transactions for build asset folder "_nuxt"', async ({ page }) => {
  let buildAssetFolderOccurred = false;

  waitForTransaction('nuxt-4', transactionEvent => {
    if (transactionEvent.transaction?.match(/^GET \/_nuxt\//)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return transactionEvent.transaction.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const transactionEvent = await transactionEventPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(transactionEvent.transaction).toBe('GET /test-param/:param()');
});

test('captures server API calls made with Nitro $fetch', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-4', async transactionEvent => {
    return transactionEvent.transaction === 'GET /api/nitro-fetch';
  });

  await page.goto(`/fetch-server-routes`);
  await page.getByText('Fetch Nitro $fetch', { exact: true }).click();

  const httpServerFetchSpan = await transactionPromise;
  const httpClientSpan = httpServerFetchSpan.spans.find(span => span.description === 'GET https://example.com/');

  expect(httpServerFetchSpan.transaction).toEqual('GET /api/nitro-fetch');
  expect(httpServerFetchSpan.contexts.trace.op).toEqual('http.server');

  expect(httpClientSpan.parent_span_id).toEqual(httpServerFetchSpan.contexts.trace.span_id);
  expect(httpClientSpan.op).toEqual('http.client');
});
