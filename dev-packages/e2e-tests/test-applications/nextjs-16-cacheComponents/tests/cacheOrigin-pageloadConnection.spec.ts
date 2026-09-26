import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

// The pageload should connect to the live serving request even though the shell is prerendered
// (trace context can only travel in the dynamic/resumed part of the response, never in cacheable
// HTML). The inverse assertion in cacheComponents.spec.ts ("Prerendered shell does not stitch
// the pageload onto a stale trace") documents today's un-connectedness.
test('connects the pageload trace to the live serving request', async ({ page }) => {
  test.fail();

  const serverTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /pageload-tracing'
    );
  });

  const pageloadTxPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/pageload-tracing';
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverTx, pageloadTx] = await Promise.all([serverTxPromise, pageloadTxPromise]);

  expect(serverTx.contexts?.trace?.trace_id).toBeTruthy();
  expect(pageloadTx.contexts?.trace?.trace_id).toBe(serverTx.contexts?.trace?.trace_id);
});
