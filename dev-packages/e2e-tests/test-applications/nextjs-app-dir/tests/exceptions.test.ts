import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/event-proxy-server';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends a client-side exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Click Error';
  });

  await page.getByText('Throw error').click();

  const errorEvent = await errorEventPromise;
  const exceptionEventId = errorEvent.event_id;

  expect(errorEvent.transaction).toBe('/');

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
