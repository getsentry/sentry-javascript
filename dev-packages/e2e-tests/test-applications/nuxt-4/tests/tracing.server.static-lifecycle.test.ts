import { SENTRY_OP, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('sends a server action transaction on pageload', async ({ page }) => {
  const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
    return transactionEvent.transaction.includes('GET /test-param/');
  });

  await page.goto('/test-param/1234');

  const transaction = await transactionPromise;

  expect(transaction.contexts.trace).toEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        [SENTRY_OP]: 'http.server',
        [SENTRY_ORIGIN]: 'auto.http.http_server',
      }),
    }),
  );
});

[
  // Nuxt build output that the HTTP integration does not ignore.
  '/_nuxt/builds/latest.json',
  '/_nuxt/entry.js.map',
  // File from `public/` that the HTTP integration does not ignore.
  '/humans.txt',
  // Common static file that the HTTP integration ignores.
  '/favicon.ico',
].forEach(path => {
  test(`does not send a server transaction for the file ${path}`, async ({ baseURL }) => {
    const transactionPaths = await getServerTransactionPathsUntilPage(`${baseURL}`, path);

    expect(transactionPaths).not.toContain(path);
  });
});

// Routes that look like build output. They also show that the helper sees sent transactions, so the tests above cannot
// pass by accident.
['/test-param/jane.doe', '/api/test-param/data.json', '/test-param/_nuxt/'].forEach(path => {
  test(`sends a server transaction for the route ${path}`, async ({ baseURL }) => {
    const transactionPaths = await getServerTransactionPathsUntilPage(`${baseURL}`, path);

    expect(transactionPaths).toContain(path);
  });
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

/**
 * Requests `path`, then a page. Returns the `url.path` of each server transaction up to the page's transaction,
 * which arrives after any transaction for `path`.
 */
async function getServerTransactionPathsUntilPage(baseURL: string, path: string): Promise<string[]> {
  const pagePath = `/test-param/after${path.replace(/\W+/g, '-')}`;
  const transactionPaths: string[] = [];
  const pageTransactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
    transactionPaths.push(`${transactionEvent.contexts?.trace?.data?.[URL_PATH]}`);
    return transactionPaths.includes(pagePath);
  });

  await fetch(`${baseURL}${path}`);
  await fetch(`${baseURL}${pagePath}`);
  await pageTransactionPromise;

  return transactionPaths;
}
