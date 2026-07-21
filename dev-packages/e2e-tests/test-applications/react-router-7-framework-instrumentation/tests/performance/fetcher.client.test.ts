import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// As of React Router 7.15+, HydratedRouter invokes the client `fetch` hook in Framework Mode.
// A fetcher submission produces a `function.react_router.fetcher` transaction
// (origin `auto.function.react_router.instrumentation_api`) that nests the client action/loader
// spans and the `http.client` spans for the underlying `.data` requests.
// See: https://github.com/remix-run/react-router/discussions/13749

test.describe('client - instrumentation API fetcher', () => {
  test('should instrument fetcher with instrumentation API origin', async ({ page }) => {
    // Wait for the client pageload to finish so HydratedRouter is hydrated and the fetcher
    // submission goes through the instrumented client `fetch` path (not a full-document POST).
    const pageloadTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === '/performance/fetcher-test' &&
        transactionEvent.contexts?.trace?.op === 'pageload'
      );
    });

    const fetcherTxPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.contexts?.trace?.op === 'function.react_router.fetcher';
    });

    await page.goto(`/performance/fetcher-test`);
    await pageloadTxPromise;

    await page.locator('#fetcher-submit').click();

    const fetcherTx = await fetcherTxPromise;

    expect(fetcherTx.contexts?.trace?.origin).toBe('auto.function.react_router.instrumentation_api');

    // The fetcher transaction nests the client action span and the http.client span(s) for the
    // underlying `.data` request(s) - i.e. the OTel/browser fetch span is parented by the fetcher
    // span, not emitted standalone.
    const spanOps = (fetcherTx.spans ?? []).map(span => span.op);
    expect(spanOps).toContain('function.react_router.client_action');
    expect(spanOps).toContain('http.client');
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
