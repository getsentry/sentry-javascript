import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('creates spans for fetch requests', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(
    page,
    spans => spans.filter(s => getSpanOp(s) === 'http.client').length >= 3,
  );

  await page.goto(url);

  const allSpans = await spansPromise;
  const pageloadSpan = allSpans.find(s => getSpanOp(s) === 'pageload');
  const requestSpans = allSpans.filter(s => getSpanOp(s) === 'http.client');

  expect(requestSpans).toHaveLength(3);

  requestSpans.forEach((span, index) =>
    expect(span).toMatchObject({
      name: `GET http://sentry-test-site.example/${index}`,
      parent_span_id: pageloadSpan?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: pageloadSpan?.trace_id,
      attributes: expect.objectContaining({
        'http.method': { type: 'string', value: 'GET' },
        'http.url': { type: 'string', value: `http://sentry-test-site.example/${index}` },
        url: { type: 'string', value: `http://sentry-test-site.example/${index}` },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        type: { type: 'string', value: 'fetch' },
      }),
    }),
  );
});
