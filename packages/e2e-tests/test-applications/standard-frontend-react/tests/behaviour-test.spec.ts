import { test, expect } from '@playwright/test';
import axios, { AxiosError } from 'axios';

const SENTRY_TEST_ORG_SLUG = 'sentry-sdks';
const SENTRY_TEST_PROJECT = 'sentry-javascript-e2e-tests';

const EVENT_POLLING_TIMEOUT = 30_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;

test('Sends an exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const exceptionIdHandle = await page.waitForFunction(() => window.capturedExceptionId);
  const exceptionEventId = await exceptionIdHandle.jsonValue();

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${SENTRY_TEST_ORG_SLUG}/${SENTRY_TEST_PROJECT}/events/${exceptionEventId}/`,
            { headers: { Authorization: `Bearer ${authToken}` } },
          );
          return response.status;
        } catch (e) {
          if (e instanceof AxiosError && e.response) {
            return e.response.status;
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

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  const recordedTransactionsHandle = await page.waitForFunction(() => {
    if (window.recordedTransactions && window.recordedTransactions?.length >= 1) {
      return window.recordedTransactions;
    } else {
      return undefined;
    }
  });
  const recordedTransactionEventIds = await recordedTransactionsHandle.jsonValue();

  if (recordedTransactionEventIds === undefined) {
    throw new Error("Application didn't record any transaction event IDs.");
  }

  let hadPageLoadTransaction = false;

  await Promise.all(
    recordedTransactionEventIds.map(async transactionEventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${SENTRY_TEST_ORG_SLUG}/${SENTRY_TEST_PROJECT}/events/${transactionEventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );

              if (response.data.contexts.trace.op === 'pageload') {
                hadPageLoadTransaction = true;
              }

              return response.status;
            } catch (e) {
              if (e instanceof AxiosError && e.response) {
                return e.response.status;
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
    }),
  );

  expect(hadPageLoadTransaction).toBe(true);
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  // Give pageload transaction time to finish
  page.waitForTimeout(4000);

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const recordedTransactionsHandle = await page.waitForFunction(() => {
    if (window.recordedTransactions && window.recordedTransactions?.length >= 2) {
      return window.recordedTransactions;
    } else {
      return undefined;
    }
  });
  const recordedTransactionEventIds = await recordedTransactionsHandle.jsonValue();

  if (recordedTransactionEventIds === undefined) {
    throw new Error("Application didn't record any transaction event IDs.");
  }

  let hadPageNavigationTransaction = false;

  await Promise.all(
    recordedTransactionEventIds.map(async transactionEventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${SENTRY_TEST_ORG_SLUG}/${SENTRY_TEST_PROJECT}/events/${transactionEventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );

              if (response.data.contexts.trace.op === 'navigation') {
                hadPageNavigationTransaction = true;
              }

              return response.status;
            } catch (e) {
              if (e instanceof AxiosError && e.response) {
                return e.response.status;
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
    }),
  );

  expect(hadPageNavigationTransaction).toBe(true);
});
