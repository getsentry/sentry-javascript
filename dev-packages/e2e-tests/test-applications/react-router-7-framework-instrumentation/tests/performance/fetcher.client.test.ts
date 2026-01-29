import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Known React Router limitation: HydratedRouter doesn't invoke instrumentation API
// hooks on the client-side in Framework Mode. This includes the router.fetch hook.
// See: https://github.com/remix-run/react-router/discussions/13749
// Using test.fixme to auto-detect when React Router fixes this upstream.

test.describe('client - instrumentation API fetcher (upstream limitation)', () => {
  test.fixme('should instrument fetcher with instrumentation API origin', async ({ page }) => {
    const serverTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'GET /performance/fetcher-test' &&
        transactionEvent.contexts?.trace?.op === 'http.server'
      );
    });

    await page.goto(`/performance/fetcher-test`);
    await serverTxPromise;

    // Wait for the fetcher action transaction
    const fetcherTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'function.react_router.fetcher' &&
        transactionEvent.contexts?.trace?.data?.['sentry.origin'] === 'auto.function.react_router.instrumentation_api'
      );
    });

    await page.locator('#fetcher-submit').click();

    const fetcherTx = await fetcherTxPromise;

    expect(fetcherTx).toMatchObject({
      contexts: {
        trace: {
          op: 'function.react_router.fetcher',
          origin: 'auto.function.react_router.instrumentation_api',
        },
      },
    });
  });

  test('should still send server action transaction when fetcher submits', async ({ page }) => {
    const serverPageloadPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'GET /performance/fetcher-test' &&
        transactionEvent.contexts?.trace?.op === 'http.server'
      );
    });

    await page.goto(`/performance/fetcher-test`);
    await serverPageloadPromise;

    // Fetcher submit triggers a server action
    const serverActionPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'POST /performance/fetcher-test' &&
        transactionEvent.contexts?.trace?.op === 'http.server'
      );
    });

    await page.locator('#fetcher-submit').click();

    const serverAction = await serverActionPromise;

    expect(serverAction).toMatchObject({
      transaction: 'POST /performance/fetcher-test',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
        },
      },
    });

    // Verify fetcher result is displayed
    await expect(page.locator('#fetcher-result')).toHaveText('Fetcher result: test-value');
  });
});
