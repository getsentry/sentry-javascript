import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('RSC - Server Function Wrapper', () => {
  test('creates transaction for wrapped server function via action', async ({ page }) => {
    await page.goto(`/rsc/server-function`);

    // Listen after page load to skip the initial GET transaction.
    // Match either a child span or a forceTransaction with the server function attribute.
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      // Match a transaction that either:
      // (a) has a child span with the server function attribute, or
      // (b) is the server function transaction itself (forceTransaction case)
      const hasServerFunctionSpan = transactionEvent.spans?.some(
        span => span.data?.['rsc.server_function.name'] === 'submitForm',
      );
      const isServerFunctionTransaction =
        transactionEvent.contexts?.trace?.data?.['rsc.server_function.name'] === 'submitForm';
      return Boolean(isServerTransaction && (hasServerFunctionSpan || isServerFunctionTransaction));
    });

    await page.locator('#submit').click();

    // Verify the form submission was successful
    await expect(page.getByTestId('message')).toContainText('Hello, Sentry User!');

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      platform: 'node',
      environment: 'qa',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      sdk: {
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
        packages: expect.arrayContaining([
          expect.objectContaining({ name: 'npm:@sentry/react-router', version: expect.any(String) }),
          expect.objectContaining({ name: 'npm:@sentry/node', version: expect.any(String) }),
        ]),
      },
    });

    // The server function span may be a child span or the transaction root itself.
    const serverFunctionSpan = transaction.spans?.find(
      span => span.data?.['rsc.server_function.name'] === 'submitForm',
    );
    const traceData = transaction.contexts?.trace?.data;

    if (serverFunctionSpan) {
      // Child span case: server function ran inside an active HTTP transaction
      expect(serverFunctionSpan).toMatchObject({
        data: expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'sentry.origin': 'auto.function.react_router.rsc.server_function',
          'rsc.server_function.name': 'submitForm',
        }),
      });
    } else {
      // forceTransaction case: server function is the transaction
      expect(traceData).toMatchObject(
        expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'rsc.server_function.name': 'submitForm',
        }),
      );
    }
  });

  test('captures error from wrapped server function', async ({ page }) => {
    const errorMessage = 'RSC Server Function Error: Something went wrong!';
    const errorPromise = waitForError(APP_NAME, errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto(`/rsc/server-function-error`);
    await page.locator('#submit').click();

    const error = await errorPromise;

    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: errorMessage,
            mechanism: {
              handled: false,
              type: 'react_router.rsc',
              data: {
                function: 'serverFunction',
                server_function_name: 'submitFormWithError',
              },
            },
          },
        ],
      },
      level: 'error',
      platform: 'node',
      environment: 'qa',
      sdk: {
        integrations: expect.any(Array<string>),
        name: 'sentry.javascript.react-router',
        version: expect.any(String),
      },
      tags: { runtime: 'node' },
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
    });
  });

  test('creates transaction for server function using export const arrow pattern', async ({ page }) => {
    // Load the page first to avoid catching the GET page load transaction.
    await page.goto('/rsc/server-function-arrow');

    // Set up listener after page load — filter for the server function span specifically.
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const hasServerFunctionSpan = transactionEvent.spans?.some(
        span => span.data?.['rsc.server_function.name'] === 'submitFormArrow',
      );
      const isServerFunctionTransaction =
        transactionEvent.contexts?.trace?.data?.['rsc.server_function.name'] === 'submitFormArrow';
      return Boolean(isServerTransaction && (hasServerFunctionSpan || isServerFunctionTransaction));
    });

    await page.locator('#submit').click();

    await expect(page.getByTestId('message')).toContainText('Arrow: Hello, Arrow User!');

    const transaction = await txPromise;

    const serverFunctionSpan = transaction.spans?.find(
      span => span.data?.['rsc.server_function.name'] === 'submitFormArrow',
    );

    if (serverFunctionSpan) {
      expect(serverFunctionSpan).toMatchObject({
        data: expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'rsc.server_function.name': 'submitFormArrow',
        }),
      });
    } else {
      // forceTransaction case: server function is the transaction
      expect(transaction.contexts?.trace?.data).toMatchObject(
        expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'rsc.server_function.name': 'submitFormArrow',
        }),
      );
    }
  });

  test('creates transaction for server function with default export only', async ({ page }) => {
    // Load the page first to avoid catching the GET page load transaction.
    await page.goto('/rsc/server-function-default');

    // Set up listener after page load — filter for the server function span specifically.
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const hasServerFunctionSpan = transactionEvent.spans?.some(
        span => span.data?.['rsc.server_function.name'] === 'default',
      );
      const isServerFunctionTransaction =
        transactionEvent.contexts?.trace?.data?.['rsc.server_function.name'] === 'default';
      return Boolean(isServerTransaction && (hasServerFunctionSpan || isServerFunctionTransaction));
    });

    await page.locator('#submit').click();

    await expect(page.getByTestId('message')).toContainText('Default: Hello, Default User!');

    const transaction = await txPromise;

    // The default export should be wrapped as "default", not as "defaultAction"
    const serverFunctionSpan = transaction.spans?.find(span => span.data?.['rsc.server_function.name'] === 'default');

    if (serverFunctionSpan) {
      expect(serverFunctionSpan).toMatchObject({
        data: expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'rsc.server_function.name': 'default',
        }),
      });
    } else {
      // forceTransaction case: server function is the transaction
      expect(transaction.contexts?.trace?.data).toMatchObject(
        expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'rsc.server_function.name': 'default',
        }),
      );
    }
  });
});
