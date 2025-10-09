import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should call onRequestSpanEnd hook', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test.io/fetch', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Type': 'fetch',
        'access-control-expose-headers': '*',
      },
      body: '',
    });
  });
  await page.route('http://sentry-test.io/xhr', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Response-Type': 'xhr',
        'access-control-expose-headers': '*',
      },
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
        type: 'xhr',
        'hook.called.response-type': 'xhr',
      }),
    }),
  );

  expect(tracingEvent.spans).toContainEqual(
    expect.objectContaining({
      op: 'http.client',
      data: expect.objectContaining({
        type: 'fetch',
        'hook.called.response-type': 'fetch',
      }),
    }),
  );
});
