import { expect, test } from '@playwright/test';
import { ReplayRecordingData } from './fixtures/ReplayRecordingData';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;

test('Sends an exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const exceptionIdHandle = await page.waitForFunction(() => window.capturedExceptionId);
  const exceptionEventId = await exceptionIdHandle.jsonValue();

  console.log(`Polling for error eventId: ${exceptionEventId}`);

  await expect
    .poll(
      async () => {
        const response = await fetch(
          `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionEventId}/`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );

        return response.status;
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
            const response = await fetch(
              `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
              { headers: { Authorization: `Bearer ${authToken}` } },
            );

            if (response.ok) {
              const data = await response.json();

              if (data.contexts.trace.op === 'pageload') {
                hadPageLoadTransaction = true;
              }
            }

            return response.status;
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
            const response = await fetch(
              `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionEventId}/`,
              { headers: { Authorization: `Bearer ${authToken}` } },
            );

            if (response.ok) {
              const data = await response.json();
              if (data.contexts.trace.op === 'navigation') {
                hadPageNavigationTransaction = true;
              }
            }

            return response.status;
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

test('Sends a Replay recording to Sentry', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');

  const replayId = await page.waitForFunction(() => {
    return window.sentryReplayId;
  });

  // Keypress event ensures LCP is finished
  await page.type('body', 'Y');

  // Wait for replay to be sent

  if (replayId === undefined) {
    throw new Error("Application didn't set a replayId");
  }

  console.log(`Polling for replay with ID: ${replayId}`);

  await expect
    .poll(
      async () => {
        const response = await fetch(
          `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/replays/${replayId}/`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );

        return response.status;
      },
      {
        timeout: EVENT_POLLING_TIMEOUT,
      },
    )
    .toBe(200);

  // now fetch the first recording segment
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/replays/${replayId}/recording-segments/?cursor=100%3A0%3A1`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );

        if (response.ok) {
          const data = await response.json();
          return { data: data[0], length: data[0].length };
        }

        return response.status;
      },
      {
        timeout: EVENT_POLLING_TIMEOUT,
      },
    )
    // Check that that all expected data is present but relax the order to avoid flakes
    .toEqual({ data: expect.arrayContaining(ReplayRecordingData), length: ReplayRecordingData.length });
});
