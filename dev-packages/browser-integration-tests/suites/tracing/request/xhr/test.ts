import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create spans for XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const requestSpans = eventData.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://sentry-test-site.example/${index}`,
      parent_span_id: eventData.contexts?.trace?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: eventData.contexts?.trace?.trace_id,
      data: {
        'http.method': 'GET',
        'http.url': `http://sentry-test-site.example/${index}`,
        url: `http://sentry-test-site.example/${index}`,
        'server.address': 'sentry-test-site.example',
        type: 'xhr',
      },
    }),
  );
});

sentryTest('should attach `sentry-trace` header to XHR requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const requests = (
    await Promise.all([
      page.goto(url),
      Promise.all([0, 1, 2].map(idx => page.waitForRequest(`http://sentry-test-site.example/${idx}`))),
    ])
  )[1];

  expect(requests).toHaveLength(3);

  const request1 = requests[0];
  const requestHeaders1 = request1.headers();
  expect(requestHeaders1).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/),
    baggage: expect.any(String),
  });

  const request2 = requests[1];
  const requestHeaders2 = request2.headers();
  expect(requestHeaders2).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/),
    baggage: expect.any(String),
    'x-test-header': 'existing-header',
  });

  const request3 = requests[2];
  const requestHeaders3 = request3.headers();
  expect(requestHeaders3).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/),
    baggage: expect.any(String),
  });
});
