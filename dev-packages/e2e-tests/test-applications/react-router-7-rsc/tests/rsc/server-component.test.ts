import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('RSC - Server Component Wrapper', () => {
  test('captures error from wrapped server component called in loader', async ({ page }) => {
    const errorMessage = 'RSC Server Component Error: Mamma mia!';
    const errorPromise = waitForError(APP_NAME, errorEvent => {
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
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const matchesRoute =
        transactionEvent.transaction?.includes('/rsc/server-component') ||
        transactionEvent.request?.url?.includes('/rsc/server-component');
      return Boolean(isServerTransaction && matchesRoute && !transactionEvent.transaction?.includes('-async'));
    });

    await page.goto(`/rsc/server-component`);

    // Verify the page renders with loader data
    await expect(page.getByTestId('loader-message')).toContainText('Hello from server loader!');

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: expect.stringMatching(/\/rsc\/server-component|GET \*/),
      platform: 'node',
      environment: 'qa',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
      spans: expect.any(Array),
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
  });

  test('async server component page loads', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const matchesRoute =
        transactionEvent.transaction?.includes('/rsc/server-component-async') ||
        transactionEvent.request?.url?.includes('/rsc/server-component-async');
      return Boolean(isServerTransaction && matchesRoute);
    });

    await page.goto(`/rsc/server-component-async`);

    // Verify the page renders async content
    await expect(page.getByTestId('title')).toHaveText('Async Server Component');
    await expect(page.getByTestId('content')).toHaveText('This content was fetched asynchronously on the server.');

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: expect.stringMatching(/\/rsc\/server-component-async|GET \*/),
      platform: 'node',
      environment: 'qa',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
      spans: expect.any(Array),
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
  });

  test('parameterized server component route works', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, transactionEvent => {
      const isServerTransaction = transactionEvent.contexts?.runtime?.name === 'node';
      const matchesRoute =
        transactionEvent.transaction?.includes('/rsc/server-component') ||
        transactionEvent.request?.url?.includes('/rsc/server-component/my-test-param');
      return Boolean(isServerTransaction && matchesRoute && !transactionEvent.transaction?.includes('-async'));
    });

    await page.goto(`/rsc/server-component/my-test-param`);

    // Verify the param was passed correctly
    await expect(page.getByTestId('param')).toContainText('my-test-param');

    const transaction = await txPromise;

    expect(transaction).toMatchObject({
      type: 'transaction',
      transaction: expect.stringMatching(/\/rsc\/server-component|GET \*/),
      platform: 'node',
      environment: 'qa',
      contexts: {
        trace: {
          span_id: expect.any(String),
          trace_id: expect.any(String),
        },
      },
      spans: expect.any(Array),
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
  });
});
