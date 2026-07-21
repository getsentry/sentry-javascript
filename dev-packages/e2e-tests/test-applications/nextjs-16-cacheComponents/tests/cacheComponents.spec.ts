import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

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

// Capturing an event inside a Server Component that is (re)generated at request time must not
// trip Next.js Cache Components prerender guards (`new Date()` / `crypto`).
test('Should capture an exception from an on-demand generated Server Component', async ({ page }) => {
  const errorPromise = waitForError('nextjs-16-cacheComponents', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Test error from cache components page';
  });

  await page.goto('/exception');

  await expect(page.locator('#result')).toHaveText('Error captured for id exception');

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.value).toBe('Test error from cache components page');
});

test('Should capture a message from an on-demand generated Server Component', async ({ page }) => {
  const messagePromise = waitForError('nextjs-16-cacheComponents', errorEvent => {
    return errorEvent.message === 'Test message from cache components page';
  });

  await page.goto('/message');

  await expect(page.locator('#result')).toHaveText('Message captured for id message');

  const message = await messagePromise;
  expect(message.message).toBe('Test message from cache components page');
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

test('Prerendered shell does not stitch the pageload onto a stale trace', async ({ page }) => {
  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', async transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /pageload-tracing'
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

  // Under Cache Components the shell is prerendered and rendered in a context detached from the
  // runtime server request, so a `sentry-trace` meta tag would carry a stale/unrelated trace. The
  // SDK therefore does not enable the trace meta tags, and the browser pageload starts a fresh trace
  // instead of stitching onto a trace that doesn't match the server request.
  expect(pageloadTraceId).toBeTruthy();
  expect(serverTraceId).not.toBe(pageloadTraceId);

  // No trace meta tags should be injected when Cache Components is enabled.
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(await page.locator('meta[name="baggage"]').count()).toBe(0);
});

test('Should prerender a page that captures an exception in generateMetadata', async ({ page }) => {
  await page.goto('/capture-metadata');

  await expect(page).toHaveTitle('capture-metadata');
  await expect(page.locator('h1')).toHaveText('capture-metadata');
});
