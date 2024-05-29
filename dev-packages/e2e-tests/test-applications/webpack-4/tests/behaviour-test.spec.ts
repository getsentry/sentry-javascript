import { expect, test } from '@playwright/test';

const EVENT_POLLING_TIMEOUT = 90_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;

test('Sends an exception to Sentry', async ({ page }) => {
  await page.goto('/');

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
