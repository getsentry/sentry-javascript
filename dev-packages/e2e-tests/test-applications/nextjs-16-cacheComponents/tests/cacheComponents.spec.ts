import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Should render cached component', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/cache');
  const serverTx = await serverTxPromise;

  // we want to skip creating spans in cached environments
  expect(serverTx.spans?.filter(span => span.op === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
});

test('Should render suspense component', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/suspense');
  const serverTx = await serverTxPromise;

  // this will be called several times in development mode, so we need to check for at least one span
  expect(serverTx.spans?.filter(span => span.op === 'get.todos').length).toBeGreaterThan(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
});

test('Should generate metadata', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/metadata');
  const serverTx = await serverTxPromise;

  expect(serverTx.spans?.filter(span => span.op === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
  await expect(page).toHaveTitle('Cache Components Metadata Test');
});

test('Should generate metadata async', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/metadata-async');
  const serverTx = await serverTxPromise;

  expect(serverTx.spans?.filter(span => span.op === 'get.todos')).toHaveLength(0);
  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');
  await expect(page).toHaveTitle('Product: 1');
});

test('Metatag injection produces exactly one pageload trace with cache components', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.transaction === 'GET /pageload-tracing'
    );
  });

  const pageloadTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/pageload-tracing';
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverTx, pageloadTx] = await Promise.all([serverTxPromise, pageloadTxPromise]);

  const serverTraceId = serverTx.contexts?.trace?.trace_id;
  const pageloadTraceId = pageloadTx.contexts?.trace?.trace_id;

  // Server and client pageload must share the same trace via metatag injection
  expect(pageloadTraceId).toBeTruthy();
  expect(serverTraceId).toBe(pageloadTraceId);

  // Exactly one set of trace meta tags — no duplicates that would cause multiple pageloads
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(1);
  expect(await page.locator('meta[name="baggage"]').count()).toBe(1);
});
