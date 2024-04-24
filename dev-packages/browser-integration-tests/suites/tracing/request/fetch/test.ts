import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create spans for fetch requests', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  // Because we fetch from http://example.com, fetch will throw a CORS error in firefox and webkit.
  // Chromium does not throw for cors errors.
  // This means that we will intercept a dynamic amount of envelopes here.

  // We will wait 500ms for all envelopes to be sent. Generally, in all browsers, the last sent
  // envelope contains tracing data.

  // If we are on FF or webkit:
  // 1st envelope contains CORS error
  // 2nd envelope contains the tracing data we want to check here
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url, timeout: 10000 });
  const tracingEvent = envelopes[envelopes.length - 1]; // last envelope contains tracing data on all browsers

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://example.com/${index}`,
      parent_span_id: tracingEvent.contexts?.trace?.span_id,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: tracingEvent.contexts?.trace?.trace_id,
      data: {
        'http.method': 'GET',
        'http.url': `http://example.com/${index}`,
        url: `http://example.com/${index}`,
        'server.address': 'example.com',
        type: 'fetch',
      },
    }),
  );
});

sentryTest('should attach `sentry-trace` header to fetch requests', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const requests = (
    await Promise.all([
      page.goto(url),
      Promise.all([0, 1, 2].map(idx => page.waitForRequest(`http://example.com/${idx}`))),
    ])
  )[1];

  expect(requests).toHaveLength(3);

  const request1 = requests[0];
  const requestHeaders1 = request1.headers();
  expect(requestHeaders1).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/),
    baggage: expect.any(String),
  });

  const request2 = requests[1];
  const requestHeaders2 = request2.headers();
  expect(requestHeaders2).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/),
    baggage: expect.any(String),
    'x-test-header': 'existing-header',
  });

  const request3 = requests[2];
  const requestHeaders3 = request3.headers();
  expect(requestHeaders3).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})-1$/),
    baggage: expect.any(String),
  });
});
