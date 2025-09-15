import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/nuxt';

test('sends a server action transaction on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
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

  waitForTransaction('nuxt-3', transactionEvent => {
    if (transactionEvent.transaction?.match(/^GET \/_nuxt\//)) {
      buildAssetFolderOccurred = true;
    }
    return false; // expects to return a boolean (but not relevant here)
  });

  const transactionEventPromise = waitForTransaction('nuxt-3', transactionEvent => {
    return transactionEvent.transaction.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const transactionEvent = await transactionEventPromise;

  expect(buildAssetFolderOccurred).toBe(false);

  expect(transactionEvent.transaction).toBe('GET /test-param/:param()');
});

test('extracts HTTP request headers as span attributes', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
    return transactionEvent.transaction.includes('GET /api/test-param/');
  });

  await fetch(`${baseURL}/api/test-param/headers-test`, {
    headers: {
      'User-Agent': 'Custom-Nuxt-Agent/3.0',
      'Content-Type': 'application/json',
      'X-Nuxt-Test': 'nuxt-header-value',
      Accept: 'application/json, text/html',
      'X-Framework': 'Nuxt',
      'X-Request-ID': 'nuxt-456',
    },
  });

  const transaction = await transactionPromise;

  expect(transaction.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'http.request.header.user_agent': 'Custom-Nuxt-Agent/3.0',
      'http.request.header.content_type': 'application/json',
      'http.request.header.x_nuxt_test': 'nuxt-header-value',
      'http.request.header.accept': 'application/json, text/html',
      'http.request.header.x_framework': 'Nuxt',
      'http.request.header.x_request_id': 'nuxt-456',
    }),
  );
});
