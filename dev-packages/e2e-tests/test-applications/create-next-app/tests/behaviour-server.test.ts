import { expect, test } from '@playwright/test';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends a server-side exception to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/api/error`);
  const data = await response.json();
  const { exceptionId } = data;

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

test('Sends server-side transactions to Sentry', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/api/success`);
  const data = await response.json();
  const { transactionIds } = data;

  console.log(`Polling for transaction eventIds: ${JSON.stringify(transactionIds)}`);

  await Promise.all(
    transactionIds.map(async (transactionId: string) => {
      const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionId}/`;

      await expect
        .poll(
          async () => {
            const response = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
            return response.status;
          },
          { timeout: EVENT_POLLING_TIMEOUT },
        )
        .toBe(200);
    }),
  );
});
