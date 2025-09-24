import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  "doesn't attach `sentry-trace` and `baggage` or `traceparent` (if `propagateTraceparent` is true) header to cross-origin requests when no tracePropagationTargets are defined",
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
      expect(requestHeaders).not.toMatchObject({
        'sentry-trace': expect.any(String),
        baggage: expect.any(String),
        traceparent: expect.any(String),
      });
    }
  },
);
