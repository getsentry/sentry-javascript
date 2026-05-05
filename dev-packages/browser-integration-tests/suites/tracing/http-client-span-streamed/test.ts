import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest(
  'sends http.client span for fetch requests without an active span when span streaming is enabled',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/api/test', route => {
      route.fulfill({
        status: 200,
        body: 'ok',
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'http.client');

    await page.goto(url);

    const span = await spanPromise;

    expect(span.name).toMatch(/^GET /);
    expect(span.attributes?.['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser' });
    expect(span.attributes?.['sentry.op']).toEqual({ type: 'string', value: 'http.client' });
  },
);
