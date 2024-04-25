import { expect, test } from '@playwright/test';
import axios, { AxiosError } from 'axios';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;

// standard front-end test, see criteria in `e2e-tests/README.md`
test('Sends a client-side exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();
  const exceptionIdHandle = await page.waitForFunction(() => window.capturedExceptionId);
  const eventId = await exceptionIdHandle.jsonValue();

  console.log(`Polling for error eventId: ${eventId}`);

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(
            `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${eventId}/`,
            { headers: { Authorization: `Bearer ${authToken}` } },
          );
          return response.status;
        } catch (e) {
          const notThereJustYet = e instanceof AxiosError && e.response && e.response.status === 404;
          if (notThereJustYet) return 404;
          throw e
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
    const hasTransactions = Array.isArray(window.recordedTransactions) && window.recordedTransactions.length >= 1;
    if (hasTransactions) return window.recordedTransactions
  });

  const recordedTransactionEventIds = await recordedTransactionsHandle.jsonValue();

  if (recordedTransactionEventIds === undefined) {
    throw new Error("Application didn't record any transaction event IDs.");
  }

  let hadPageLoadTransaction = false;

  console.log(`Polling for transaction eventIds: ${JSON.stringify(recordedTransactionEventIds)}`);

  // meaning at least one should be 'pageload'
  await Promise.all(
    (recordedTransactionEventIds as string[]).map(async eventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${eventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );
              hadPageLoadTransaction = response.data.contexts.trace.op === 'pageload';
              return response.status;
            } catch (e) {
              const notThereJustYet = e instanceof AxiosError && e.response && e.response.status === 404;
              if (notThereJustYet) return 404;
              throw e
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

  // there sould be at least 2 transactions: page load + navigation
  const recordedTransactionsHandle = await page.waitForFunction(() => {
    const hasTransactions = Array.isArray(window.recordedTransactions) && window.recordedTransactions.length >= 2;
    if (hasTransactions) return window.recordedTransactions
  });

  const recordedTransactionEventIds = await recordedTransactionsHandle.jsonValue();

  if (recordedTransactionEventIds === undefined) {
    throw new Error("Application didn't record any transaction event IDs.");
  }

  let hadPageNavigationTransaction = false;

  console.log(`Polling for transaction eventIds: ${JSON.stringify(recordedTransactionEventIds)}`);

  // meaning at least one should be 'navigation'
  await Promise.all(
    (recordedTransactionEventIds as string[]).map(async eventId => {
      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(
                `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${eventId}/`,
                { headers: { Authorization: `Bearer ${authToken}` } },
              );
              hadPageNavigationTransaction = response.data.contexts.trace.op === 'navigation';
              return response.status;
            } catch (e) {
              if (e instanceof AxiosError && e.response) {
                const notThereJustYet = e instanceof AxiosError && e.response && e.response.status === 404;
                if (notThereJustYet) return 404;
                throw e
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
  // For referece:
  // should resemble this (the trace is actually generate per request):
  //<meta name="sentry-trace" content="5ca317544dcf46b29b81dc33fb75650e-e71485ffa21ebb6c-1">
  const sentryTraceMetaTag = await page.waitForSelector('meta[name="sentry-trace"]', {
    state: 'attached',
  });

  // For referece:
  // should resemble this (the trace ID inside content being actually generated per request, see above):
  // <meta name="baggage" content="sentry-environment=qa,sentry-public_key=dced...ce,sentry-trace_id=5c..c-1,sentry-sample_rate=1,sentry-transaction=routes%2Fuser.%24id,sentry-sampled=true">
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

