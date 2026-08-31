import { expect } from '@playwright/test';
import { sentryTest, TEST_HOST } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('names spans for relative fetch requests after the page domain', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(
    page,
    spans => spans.filter(s => getSpanOp(s) === 'http.client').length >= 3,
  );

  await page.goto(url);

  const allSpans = await spansPromise;
  const pageloadSpan = allSpans.find(s => getSpanOp(s) === 'pageload');
  const requestSpans = allSpans
    .filter(s => getSpanOp(s) === 'http.client')
    .sort((a, b) =>
      (a.attributes!['url.full']!.value as string).localeCompare(b.attributes!['url.full']!.value as string),
    );

  expect(requestSpans).toHaveLength(3);

  requestSpans.forEach((span, index) =>
    expect(span).toMatchObject({
      // A relative URL has no domain of its own, so it resolves against the page origin.
      name: 'GET sentry-test.io',
      parent_span_id: pageloadSpan?.span_id,
      trace_id: pageloadSpan?.trace_id,
      attributes: expect.objectContaining({
        'http.request.method': { type: 'string', value: 'GET' },
        'url.full': { type: 'string', value: `${TEST_HOST}/test-req/${index}` },
        'url.domain': { type: 'string', value: 'sentry-test.io' },
        'server.address': { type: 'string', value: 'sentry-test.io' },
        type: { type: 'string', value: 'fetch' },
      }),
    }),
  );
});
