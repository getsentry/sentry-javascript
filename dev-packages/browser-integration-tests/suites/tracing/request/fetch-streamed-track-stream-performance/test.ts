import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'span has correct attributes when trackFetchStreamPerformance is enabled',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/*', route =>
      route.fulfill({ body: 'ok', status: 200 }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spansPromise = waitForStreamedSpans(page, spans => spans.some(s => getSpanOp(s) === 'http.client'));

    await page.goto(url);

    const allSpans = await spansPromise;
    const pageloadSpan = allSpans.find(s => getSpanOp(s) === 'pageload');
    const requestSpan = allSpans.find(s => getSpanOp(s) === 'http.client');

    expect(requestSpan).toBeDefined();
    expect(requestSpan!.end_timestamp).toBeGreaterThan(requestSpan!.start_timestamp);
    expect(requestSpan).toMatchObject({
      name: 'GET http://sentry-test-site.example/delayed',
      parent_span_id: pageloadSpan?.span_id,
      span_id: expect.stringMatching(/[a-f\d]{16}/),
      start_timestamp: expect.any(Number),
      end_timestamp: expect.any(Number),
      trace_id: pageloadSpan?.trace_id,
      status: 'ok',
      attributes: expect.objectContaining({
        'http.method': { type: 'string', value: 'GET' },
        'http.url': { type: 'string', value: 'http://sentry-test-site.example/delayed' },
        url: { type: 'string', value: 'http://sentry-test-site.example/delayed' },
        'server.address': { type: 'string', value: 'sentry-test-site.example' },
        type: { type: 'string', value: 'fetch' },
        'http.response.status_code': { type: 'integer', value: 200 },
      }),
    });
  },
);
