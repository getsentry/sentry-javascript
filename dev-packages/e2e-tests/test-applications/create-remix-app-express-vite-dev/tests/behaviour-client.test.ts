import { expect, test } from '@playwright/test';
import axios, { AxiosError } from 'axios';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;

test('Sends a client-side exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const exceptionIdHandle = await page.waitForFunction(() => window.capturedExceptionId);
  const exceptionEventId = await exceptionIdHandle.jsonValue();

  console.log(`Polling for error eventId: ${exceptionEventId}`);

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionEventId}/`,
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

  console.log(`Polling for transaction eventIds: ${JSON.stringify(recordedTransactionEventIds)}`);

  await Promise.all(
    recordedTransactionEventIds.map(async transactionEventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );

              if (response.data.contexts.trace.op === 'pageload') {
                hadPageLoadTransaction = true;
              }

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
    }),
  );

  expect(hadPageLoadTransaction).toBe(true);
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  // Give pageload transaction time to finish
  await page.waitForTimeout(4000);

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

  console.log(`Polling for transaction eventIds: ${JSON.stringify(recordedTransactionEventIds)}`);

  await Promise.all(
    recordedTransactionEventIds.map(async transactionEventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );

              if (response.data.contexts.trace.op === 'navigation') {
                hadPageNavigationTransaction = true;
              }

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
    }),
  );

  expect(hadPageNavigationTransaction).toBe(true);
});

test('Renders `sentry-trace` and `baggage` meta tags for the root route', async ({ page }) => {
  await page.goto('/');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});

test('Renders `sentry-trace` and `baggage` meta tags for a sub-route', async ({ page }) => {
  await page.goto('/user/123');

  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });
  const baggageMetaTag = await page.waitForSelector('meta[name="baggage"]', {
    state: 'attached',
  });

  expect(sentryTraceMetaTag).toBeTruthy();
  expect(baggageMetaTag).toBeTruthy();
});
