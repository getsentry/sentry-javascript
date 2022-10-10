import { test, expect } from '@playwright/test';
import axios, { AxiosError } from 'axios';

const SENTRY_TEST_ORG_SLUG = 'sentry-sdks';
const SENTRY_TEST_PROJECT = 'sentry-javascript-e2e-tests';

const EVENT_POLLING_TIMEOUT = 45000;
const EVENT_POLLING_RETRY_INTERVAL = 1000;

const authToken = process.env.E2E_TEST_AUTH_TOKEN;

test('Sends an exception to Sentry', async ({ page }) => {
  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const exceptionIdHandle = await page.waitForFunction(() => window.capturedExceptionId);
  const exceptionEventId = await exceptionIdHandle.jsonValue();

  let lastErrorResponse: AxiosError | undefined;

  const timeout = setTimeout(() => {
    if (lastErrorResponse?.response?.status) {
      throw new Error(
        `Timeout reached while polling event. Last received status code: ${lastErrorResponse.response.status}`,
      );
    } else {
      throw new Error('Timeout reached while polling event.');
    }
  }, EVENT_POLLING_TIMEOUT);

  while (true) {
    try {
      const response = await axios.get(
        `https://sentry.io/api/0/projects/${SENTRY_TEST_ORG_SLUG}/${SENTRY_TEST_PROJECT}/events/${exceptionEventId}/`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      clearTimeout(timeout);
      expect(response?.status).toBe(200);
      break;
    } catch (e) {
      lastErrorResponse = e;
      await new Promise(resolve => setTimeout(resolve, EVENT_POLLING_RETRY_INTERVAL));
    }
  }
});
