import { URL_FULL, HTTP_REQUEST_METHOD, URL_DOMAIN, SERVER_ADDRESS } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest, TEST_HOST } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('names spans for relative XHR requests after the page domain', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

  await page.goto(url);

  const pageloadSpan = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const requestSpans = spans
    .filter(s => getSpanOp(s) === 'http.client')
    .sort((a, b) => (a.attributes![URL_FULL]!.value as string).localeCompare(b.attributes![URL_FULL]!.value as string));

  expect(requestSpans).toHaveLength(3);

  requestSpans.forEach((span, index) =>
    expect(span).toMatchObject({
      // A relative URL has no domain of its own, so it resolves against the page origin.
      name: 'GET sentry-test.io',
      parent_span_id: pageloadSpan.span_id,
      trace_id: pageloadSpan.trace_id,
      attributes: expect.objectContaining({
        [HTTP_REQUEST_METHOD]: { type: 'string', value: 'GET' },
        [URL_FULL]: { type: 'string', value: `${TEST_HOST}/test-req/${index}` },
        [URL_DOMAIN]: { type: 'string', value: 'sentry-test.io' },
        [SERVER_ADDRESS]: { type: 'string', value: 'sentry-test.io' },
        type: { type: 'string', value: 'xhr' },
      }),
    }),
  );
});

sentryTest('should attach `sentry-trace` header to xhr requests', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const requests = (
    await Promise.all([
      page.goto(url),
      Promise.all([0, 1, 2].map(idx => page.waitForRequest(`${TEST_HOST}/test-req/${idx}`))),
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
