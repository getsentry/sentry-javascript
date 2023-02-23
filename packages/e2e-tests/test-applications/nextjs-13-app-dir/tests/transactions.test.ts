import { test, expect } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import axios, { AxiosError } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 30_000;

test('Sends a pageload transaction', async ({ page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  console.log(`Polling for pageload transaction eventId: ${transactionEventId}`);

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

test('Sends a transaction for a server component', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    console.log(transactionEvent);
    return (
      transactionEvent?.contexts?.trace?.op === 'function.nextjs' &&
      transactionEvent?.transaction === 'Page Server Component (/user/[id])'
    );
  });

  await page.goto('/user/4');

  const transactionEvent = await serverComponentTransactionPromise;
  const transactionEventId = transactionEvent.event_id;

  console.log(`Polling for server component transaction eventId: ${transactionEventId}`);

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
