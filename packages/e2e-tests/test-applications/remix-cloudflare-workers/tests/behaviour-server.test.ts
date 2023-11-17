import { test, expect } from '@playwright/test';
import axios, { AxiosError } from 'axios';

const EVENT_POLLING_TIMEOUT = 60_000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;

test('Sends a server-side captured error to Sentry', async ({ page }) => {
  await page.goto('/server-error');

  const exceptionIdHandle = await page.waitForSelector('#event-id');
  const exceptionEventId = await exceptionIdHandle.textContent();

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
