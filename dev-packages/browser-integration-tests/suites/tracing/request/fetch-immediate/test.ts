import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should create spans for fetch requests called directly after init', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  await page.goto(url);
  const pageload = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const requestSpans = spans.filter(span => getSpanOp(span) === 'http.client');

  expect(requestSpans).toHaveLength(1);

  expect(requestSpans![0]).toMatchObject({
    name: 'GET sentry-test-site.example',
    parent_span_id: pageload.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    trace_id: pageload.trace_id,
    attributes: expect.objectContaining({
      'http.request.method': { type: 'string', value: 'GET' },
      'url.full': { type: 'string', value: 'http://sentry-test-site.example/0' },
      'server.address': { type: 'string', value: 'sentry-test-site.example' },
      type: { type: 'string', value: 'fetch' },
    }),
  });
});
