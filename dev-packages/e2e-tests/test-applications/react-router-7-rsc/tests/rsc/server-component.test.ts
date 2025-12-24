import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('RSC - Server Component Wrapper', () => {
  test('captures error from wrapped server component called in loader', async ({ page }) => {
    const errorMessage = 'RSC Server Component Error: Mamma mia!';
    const errorPromise = waitForError(APP_NAME, async errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === errorMessage;
    });

    await page.goto(`/rsc/server-component-error`);

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
                function: 'ServerComponent',
                component_route: '/rsc/server-component-error',
                component_type: 'Page',
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

  test('server component page loads with loader data', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /rsc/server-component';
    });

    await page.goto(`/rsc/server-component`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: 'GET /rsc/server-component',
      platform: 'node',
      environment: 'qa',
    });

    // Verify the page renders with loader data
    await expect(page.getByTestId('loader-message')).toContainText('Hello from server loader!');
  });

  test('async server component page loads', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /rsc/server-component-async';
    });

    await page.goto(`/rsc/server-component-async`);

    const transaction = await txPromise;

    expect(transaction).toBeDefined();

    // Verify the page renders async content
    await expect(page.getByTestId('title')).toHaveText('Async Server Component');
    await expect(page.getByTestId('content')).toHaveText('This content was fetched asynchronously on the server.');
  });

  test('parameterized server component route works', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /rsc/server-component/:param';
    });

    await page.goto(`/rsc/server-component/my-test-param`);

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      transaction: 'GET /rsc/server-component/:param',
    });

    // Verify the param was passed correctly
    await expect(page.getByTestId('param')).toContainText('my-test-param');
  });
});
