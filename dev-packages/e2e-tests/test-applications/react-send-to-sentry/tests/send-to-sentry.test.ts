import { expect, test } from '@playwright/test';
import { ReplayRecordingData } from './fixtures/ReplayRecordingData';
import { EVENT_POLLING_OPTIONS, findErrorInTrace, findTransactionInTrace } from './utils/sentry-api';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;

test('Sends an exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const capturedExceptionHandle = await page.waitForFunction(() => window.capturedException);
  const capturedException = await capturedExceptionHandle.jsonValue();

  if (capturedException === undefined) {
    throw new Error("Application didn't record the captured exception.");
  }

  const { eventId, traceId } = capturedException;

  console.log(`Polling for error eventId: ${eventId} in trace: ${traceId}`);

  await expect.poll(() => findErrorInTrace(traceId, eventId), EVENT_POLLING_OPTIONS).toBeDefined();
});

test('Sends a pageload transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  const transactionHandle = await page.waitForFunction(() =>
    window.recordedTransactions?.find(transaction => transaction.op === 'pageload'),
  );
  const pageloadTransaction = await transactionHandle.jsonValue();

  if (pageloadTransaction === undefined) {
    throw new Error("Application didn't record a pageload transaction.");
  }

  const { eventId, traceId } = pageloadTransaction;

  console.log(`Polling for pageload transaction eventId: ${eventId} in trace: ${traceId}`);

  await expect
    .poll(() => findTransactionInTrace(traceId, eventId), EVENT_POLLING_OPTIONS)
    .toMatchObject({ op: 'pageload' });
});

test('Sends a navigation transaction to Sentry', async ({ page }) => {
  await page.goto('/');

  // Give pageload transaction time to finish
  await page.waitForTimeout(4000);

  const linkElement = page.locator('id=navigation');
  await linkElement.click();

  const transactionHandle = await page.waitForFunction(() =>
    window.recordedTransactions?.find(transaction => transaction.op === 'navigation'),
  );
  const navigationTransaction = await transactionHandle.jsonValue();

  if (navigationTransaction === undefined) {
    throw new Error("Application didn't record a navigation transaction.");
  }

  const { eventId, traceId } = navigationTransaction;

  console.log(`Polling for navigation transaction eventId: ${eventId} in trace: ${traceId}`);

  await expect
    .poll(() => findTransactionInTrace(traceId, eventId), EVENT_POLLING_OPTIONS)
    .toMatchObject({ op: 'navigation' });
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
