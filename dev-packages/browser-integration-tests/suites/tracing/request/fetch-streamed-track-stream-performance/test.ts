import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'creates an http.client.stream sibling span when fetchStreamPerformanceIntegration is used',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/*', route =>
      route.fulfill({
        body: 'data: ok\n\n',
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    // Wait for each span type separately since they may arrive in different envelopes
    const httpSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');
    const streamSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client.stream');

    await page.goto(url);

    const [requestSpan, streamSpan] = await Promise.all([httpSpanPromise, streamSpanPromise]);

    expect(requestSpan).toMatchObject({
      name: 'GET http://sentry-test-site.example/delayed',
      status: 'ok',
    });

    expect(streamSpan).toMatchObject({
      name: 'GET http://sentry-test-site.example/delayed',
      attributes: expect.objectContaining({
        'http.method': { type: 'string', value: 'GET' },
        url: { type: 'string', value: 'http://sentry-test-site.example/delayed' },
        type: { type: 'string', value: 'fetch' },
      }),
    });

    expect(streamSpan.end_timestamp).toBeGreaterThan(streamSpan.start_timestamp);
  },
);
