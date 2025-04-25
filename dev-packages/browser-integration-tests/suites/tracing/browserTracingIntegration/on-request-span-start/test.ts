import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should call onRequestSpanStart hook', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site-fetch.example/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '',
    });
  });
  await page.route('http://sentry-test-site-xhr.example/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '',
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url, timeout: 10000 });

  const tracingEvent = envelopes[envelopes.length - 1]; // last envelope contains tracing data on all browsers

  expect(tracingEvent.spans).toContainEqual(
    expect.objectContaining({
      op: 'http.client',
      data: expect.objectContaining({
        'hook.called.headers': 'xhr',
      }),
    }),
  );

  expect(tracingEvent.spans).toContainEqual(
    expect.objectContaining({
      op: 'http.client',
      data: expect.objectContaining({
        'hook.called.headers': 'fetch',
      }),
    }),
  );
});
