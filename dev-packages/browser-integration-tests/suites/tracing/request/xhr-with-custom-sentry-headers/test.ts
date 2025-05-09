import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'attaches manually passed in `sentry-trace` and `baggage` headers to XHR requests',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const requestPromise = page.waitForRequest('http://sentry-test-site.example/1');

    await page.goto(url);

    const request = await requestPromise;

    const requestHeaders = request.headers();
    expect(requestHeaders).toMatchObject({
      'sentry-trace': '123-abc-1',
      baggage: 'sentry-release=1.1.1,  sentry-trace_id=123',
      'x-test-header': 'existing-header',
    });
  },
);
