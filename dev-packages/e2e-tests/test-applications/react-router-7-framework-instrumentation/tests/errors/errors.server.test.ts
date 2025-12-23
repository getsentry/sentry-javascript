import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - instrumentation API error capture', () => {
  test('should capture loader errors with instrumentation API mechanism', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Loader error for testing';
    });

    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/error-loader';
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const [error, transaction] = await Promise.all([errorPromise, txPromise]);

    // Verify the error was captured with correct mechanism and transaction name
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Loader error for testing',
            mechanism: {
              type: 'react_router.loader',
              handled: false,
            },
          },
        ],
      },
      transaction: 'GET /performance/error-loader',
    });

    // Verify the transaction was also created with correct attributes
    expect(transaction).toMatchObject({
      transaction: 'GET /performance/error-loader',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
        },
      },
    });
  });

  test('should include loader span in transaction even when loader throws', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/error-loader';
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const transaction = await txPromise;

    // Find the loader span
    const loaderSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.loader',
    );

    expect(loaderSpan).toMatchObject({
      data: {
        'sentry.origin': 'auto.function.react_router.instrumentation_api',
        'sentry.op': 'function.react_router.loader',
      },
      op: 'function.react_router.loader',
    });
  });

  test('error and transaction should share the same trace', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Loader error for testing';
    });

    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/error-loader';
    });

    await page.goto(`/performance/error-loader`).catch(() => {
      // Expected to fail due to loader error
    });

    const [error, transaction] = await Promise.all([errorPromise, txPromise]);

    // Error and transaction should have the same trace_id
    expect(error.contexts?.trace?.trace_id).toBe(transaction.contexts?.trace?.trace_id);
  });

  test('should capture action errors with instrumentation API mechanism', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Action error for testing';
    });

    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'POST /performance/error-action';
    });

    await page.goto(`/performance/error-action`);
    await page.getByRole('button', { name: 'Trigger Error' }).click();

    const [error, transaction] = await Promise.all([errorPromise, txPromise]);

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Action error for testing',
            mechanism: {
              type: 'react_router.action',
              handled: false,
            },
          },
        ],
      },
      transaction: 'POST /performance/error-action',
    });

    expect(transaction).toMatchObject({
      transaction: 'POST /performance/error-action',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
        },
      },
    });
  });

  test('should capture middleware errors with instrumentation API mechanism', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Middleware error for testing';
    });

    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/error-middleware';
    });

    await page.goto(`/performance/error-middleware`).catch(() => {
      // Expected to fail due to middleware error
    });

    const [error, transaction] = await Promise.all([errorPromise, txPromise]);

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Middleware error for testing',
            mechanism: {
              type: 'react_router.middleware',
              handled: false,
            },
          },
        ],
      },
      transaction: 'GET /performance/error-middleware',
    });

    expect(transaction).toMatchObject({
      transaction: 'GET /performance/error-middleware',
      contexts: {
        trace: {
          op: 'http.server',
          origin: 'auto.http.react_router.instrumentation_api',
        },
      },
    });
  });
});
