import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  'should attach `sentry-trace` and `baggage` header to same-origin requests when no tracePropagationTargets are defined',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const requests = (
      await Promise.all([page.goto(url), Promise.all([0, 1, 2].map(idx => page.waitForRequest(`**/${idx}`)))])
    )[1];

    expect(requests).toHaveLength(3);

    for (const request of requests) {
      const requestHeaders = request.headers();
      expect(requestHeaders).toMatchObject({
        'sentry-trace': expect.any(String),
        baggage: expect.any(String),
      });
    }
  },
);
