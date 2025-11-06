import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest('should create spans for fetch requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const tracingEvent = envelopeRequestParser(req);

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans?.forEach((span, index) =>
    expect(span).toMatchObject({
      description: `GET http://sentry-test-site.example/${index}`,
      parent_span_id: tracingEvent.contexts?.trace?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: tracingEvent.contexts?.trace?.trace_id,
      data: {
        'http.method': 'GET',
        'http.url': `http://sentry-test-site.example/${index}`,
        url: `http://sentry-test-site.example/${index}`,
        'server.address': 'sentry-test-site.example',
        type: 'fetch',
      },
    }),
  );
});

sentryTest('attaches `sentry-trace` and `baggage` headers to fetch requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

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
  // traceparent must only be attached if propagateTraceparent is `true`
  expect(requestHeaders1).not.toHaveProperty('traceparent');

  const request2 = requests[1];
  const requestHeaders2 = request2.headers();
  expect(requestHeaders2).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/),
    baggage: expect.any(String),
    'x-test-header': 'existing-header',
  });
  expect(requestHeaders2).not.toHaveProperty('traceparent');

  const request3 = requests[2];
  const requestHeaders3 = request3.headers();
  expect(requestHeaders3).toMatchObject({
    'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/),
    baggage: expect.any(String),
  });
  expect(requestHeaders3).not.toHaveProperty('traceparent');
});
