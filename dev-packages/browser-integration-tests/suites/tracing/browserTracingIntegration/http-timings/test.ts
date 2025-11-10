import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('creates fetch spans with http timing', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }
  await page.route('http://sentry-test-site.example/*', async route => {
    const request = route.request();
    const postData = await request.postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(Object.assign({ id: 1 }, postData)),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname });

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url, timeout: 10000 });
  const tracingEvent = envelopes[envelopes.length - 1]; // last envelope contains tracing data on all browsers

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  await page.pause();
  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://sentry-test-site.example/${index}`,
      parent_span_id: tracingEvent.contexts?.trace?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: tracingEvent.contexts?.trace?.trace_id,
      data: expect.objectContaining({
        'http.request.redirect_start': expect.any(Number),
        'http.request.redirect_end': expect.any(Number),
        'http.request.worker_start': expect.any(Number),
        'http.request.fetch_start': expect.any(Number),
        'http.request.domain_lookup_start': expect.any(Number),
        'http.request.domain_lookup_end': expect.any(Number),
        'http.request.connect_start': expect.any(Number),
        'http.request.secure_connection_start': expect.any(Number),
        'http.request.connection_end': expect.any(Number),
        'http.request.request_start': expect.any(Number),
        'http.request.response_start': expect.any(Number),
        'http.request.response_end': expect.any(Number),
        'http.request.time_to_first_byte': expect.any(Number),
        'network.protocol.version': expect.any(String),
      }),
    }),
  );
});
