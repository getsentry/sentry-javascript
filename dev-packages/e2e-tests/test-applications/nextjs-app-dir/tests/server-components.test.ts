import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import axios, { AxiosError } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends a transaction for a server component', async ({ page }) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'function.nextjs' &&
      transactionEvent?.transaction === 'Page Server Component (/server-component/parameter/[...parameters])'
    );
  });

  await page.goto('/server-component/parameter/1337/42');

  const transactionEvent = await serverComponentTransactionPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEvent.request?.headers).toBeDefined();

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
            { headers: { Authorization: `Bearer ${authToken}` } },
          );

          return response.status;
        } catch (e) {
          if (e instanceof AxiosError && e.response) {
            if (e.response.status !== 404) {
              throw e;
            } else {
              return e.response.status;
            }
          } else {
            throw e;
          }
        }
      },
      {
        timeout: EVENT_POLLING_TIMEOUT,
      },
    )
    .toBe(200);
});

test('Should not set an error status on a server component transaction when it redirects', async ({ page }) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/redirect)';
  });

  await page.goto('/server-component/redirect');

  expect((await serverComponentTransactionPromise).contexts?.trace?.status).not.toBe('internal_error');
});

test('Should set a "not_found" status on a server component transaction when notFound() is called', async ({
  page,
}) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/not-found)';
  });

  await page.goto('/server-component/not-found');

  expect((await serverComponentTransactionPromise).contexts?.trace?.status).toBe('not_found');
});

test('Should capture an error and transaction with correct status for a faulty server component', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-13-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/faulty)';
  });

  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const transactionEvent = await transactionEventPromise;
  const errorEvent = await errorEventPromise;

  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');

  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
