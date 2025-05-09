import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'instrumentation should pass on headers from fetch options instead of init request, if set',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const requestPromise = page.waitForRequest('http://sentry-test-site.example/api/test/');

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const request = await requestPromise;

    const headers = await request.allHeaders();

    // headers.bar was set in fetch options (and should be sent)
    expect(headers.bar).toBe('22');
    // headers.foo was set in init request object (and should be ignored)
    expect(headers.foo).toBeUndefined();
  },
);
