import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, getFirstSentryEnvelopeRequest, waitForErrorRequest } from '../../../utils/helpers';

sentryTest('httpContextIntegration captures user-agent and referrer', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

  // Simulate document.referrer being set to test full functionality of the integration
  await page.goto(url, { referer: 'https://sentry.io/' });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);

  expect(errorEvent.request).toEqual({
    headers: {
      'User-Agent': expect.any(String),
      Referer: 'https://sentry.io/',
    },
    url: expect.any(String),
  });
});

sentryTest('httpContextIntegration filters sensitive query params in the URL', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = waitForErrorRequest(page);

  await page.goto(`${url}?jwt=sensitive-jwt-value&page=1`);

  const errorEvent = envelopeRequestParser(await errorEventPromise);

  expect(errorEvent.request?.url).toBe(`${url}?jwt=[Filtered]&page=1`);
});
