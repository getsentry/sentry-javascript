import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('creates spans for XHR requests', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

  await page.goto(url);

  const pageloadSpan = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const allSpans = spans;
  const requestSpans = allSpans
    .filter(s => getSpanOp(s) === 'http.client')
    .sort((a, b) =>
      (a.attributes!['url.full']!.value as string).localeCompare(b.attributes!['url.full']!.value as string),
    );

  expect(requestSpans).toHaveLength(3);

  requestSpans.forEach((span, index) =>
    expect(span).toMatchObject({
      // Streamed span names drop the high-cardinality URL path.
      name: 'GET sentry-test-site.example',
      parent_span_id: pageloadSpan?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: pageloadSpan?.trace_id,
      attributes: expect.objectContaining({
        'http.request.method': { type: 'string', value: 'GET' },
        'url.full': { type: 'string', value: `http://sentry-test-site.example/${index}` },
        'url.domain': { type: 'string', value: 'sentry-test-site.example' },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        type: { type: 'string', value: 'xhr' },
      }),
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
