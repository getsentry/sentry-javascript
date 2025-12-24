import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('RSC - Server Function Wrapper', () => {
  test('creates transaction for wrapped server function via action', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      // The server function is called via the action, look for the action transaction
      return transactionEvent.transaction?.includes('/rsc/server-function');
    });

    await page.goto(`/rsc/server-function`);
    await page.locator('#submit').click();

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      platform: 'node',
      environment: 'qa',
    });

    // Check for server function span in the transaction
    const serverFunctionSpan = transaction.spans?.find(
      (span: any) => span.data?.['rsc.server_function.name'] === 'submitForm',
    );

    if (serverFunctionSpan) {
      expect(serverFunctionSpan).toMatchObject({
        data: expect.objectContaining({
          'sentry.op': 'function.rsc.server_function',
          'sentry.origin': 'auto.function.react_router.rsc.server_function',
          'rsc.server_function.name': 'submitForm',
        }),
      });
    }

    // Verify the form submission was successful
    await expect(page.getByTestId('message')).toContainText('Hello, Sentry User!');
  });

  test('captures error from wrapped server function', async ({ page }) => {
    const errorMessage = 'RSC Server Function Error: Something went wrong!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
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
              type: 'instrument',
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

  test('server function page loads correctly', async ({ page }) => {
    await page.goto(`/rsc/server-function`);

    // Verify the page structure
    await expect(page.locator('h1')).toHaveText('Server Function Test');
    await expect(page.locator('#name')).toHaveValue('Sentry User');
    await expect(page.locator('#submit')).toBeVisible();
  });

  test('server function form submission with custom input', async ({ page }) => {
    await page.goto(`/rsc/server-function`);
    await page.fill('#name', 'Test User');
    await page.locator('#submit').click();

    // Verify the form submission result
    await expect(page.getByTestId('message')).toContainText('Hello, Test User!');
  });
});
