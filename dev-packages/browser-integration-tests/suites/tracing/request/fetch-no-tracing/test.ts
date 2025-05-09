import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should not attach `sentry-trace` header to fetch requests without tracing',
  async ({ getLocalTestUrl, page }) => {
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

    for (const request of requests) {
      const requestHeaders = request.headers();
      expect(requestHeaders['sentry-trace']).toBeUndefined();
      expect(requestHeaders['baggage']).toBeUndefined();
    }
  },
);
