import { expect, test } from '@playwright/test';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;

test('Sends exception to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-error`);
  const { exceptionId } = await response.json();

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionId}/`;

  console.log(`Polling for error eventId: ${exceptionId}`);

  await expect
    .poll(
      async () => {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
        return response.status;
      },
      { timeout: EVENT_POLLING_TIMEOUT },
    )
    .toBe(200);
});

test('Sends transaction to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-transaction`);
  const { transactionId } = await response.json();

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionId}/`;

  console.log(`Polling for transaction eventId: ${transactionId}`);

  await expect
    .poll(
      async () => {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
        return response.status;
      },
      { timeout: EVENT_POLLING_TIMEOUT },
    )
    .toBe(200);
});
