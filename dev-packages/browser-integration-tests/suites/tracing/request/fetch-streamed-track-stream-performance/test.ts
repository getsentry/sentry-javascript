import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest(
  'creates an http.client.stream sibling span when fetchStreamPerformanceIntegration is used',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok', status: 200 }));

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spansPromise = waitForStreamedSpans(
      page,
      spans =>
        spans.some(s => getSpanOp(s) === 'http.client') && spans.some(s => getSpanOp(s) === 'http.client.stream'),
    );

    await page.goto(url);

    const allSpans = await spansPromise;
    const pageloadSpan = allSpans.find(s => getSpanOp(s) === 'pageload');
    const requestSpan = allSpans.find(s => getSpanOp(s) === 'http.client');
    const streamSpan = allSpans.find(s => getSpanOp(s) === 'http.client.stream');

    expect(requestSpan).toBeDefined();
    expect(streamSpan).toBeDefined();

    // The http.client span ends at header arrival
    expect(requestSpan).toMatchObject({
      name: 'GET http://sentry-test-site.example/delayed',
      parent_span_id: pageloadSpan?.span_id,
      trace_id: pageloadSpan?.trace_id,
      status: 'ok',
    });

    // The stream span starts where the http.client span ends and shares the same parent
    expect(streamSpan).toMatchObject({
      name: 'GET http://sentry-test-site.example/delayed',
      parent_span_id: pageloadSpan?.span_id,
      trace_id: pageloadSpan?.trace_id,
      attributes: expect.objectContaining({
        'http.method': { type: 'string', value: 'GET' },
        url: { type: 'string', value: 'http://sentry-test-site.example/delayed' },
        type: { type: 'string', value: 'fetch' },
      }),
    });

    // Allow a small margin for timestamp resolution differences
    expect(streamSpan!.start_timestamp).toBeGreaterThanOrEqual(requestSpan!.end_timestamp - 0.01);
    expect(streamSpan!.end_timestamp).toBeGreaterThan(streamSpan!.start_timestamp);
  },
);
