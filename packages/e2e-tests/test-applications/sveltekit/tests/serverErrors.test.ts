import { test, expect } from '@playwright/test';
import { waitForError } from '../event-proxy-server';
import axios, { AxiosError } from 'axios';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 30_000;

test('Sends a server load error to Sentry', async ({ page }) => {
  const errorEventPromise = waitForError('sveltekit', errorEvent => {
    console.log('>>> ERROR', errorEvent);
    return errorEvent?.exception?.values?.[0]?.value === 'Whoops - Server Load Error!';
  });

  await page.goto('/server-load-error');

  const errorEvent = await errorEventPromise;
  const exceptionEventId = errorEvent.event_id;

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
