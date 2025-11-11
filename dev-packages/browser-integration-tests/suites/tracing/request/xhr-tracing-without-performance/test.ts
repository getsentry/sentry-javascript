import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'should attach `sentry-trace` header to tracing without performance (TWP) xhr requests',
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

    const request1 = requests[0];
    const requestHeaders1 = request1.headers();
    expect(requestHeaders1).toMatchObject({
      'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})$/),
      baggage: expect.any(String),
    });

    const request2 = requests[1];
    const requestHeaders2 = request2.headers();
    expect(requestHeaders2).toMatchObject({
      'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})$/),
      baggage: expect.any(String),
      'x-test-header': 'existing-header',
    });

    const request3 = requests[2];
    const requestHeaders3 = request3.headers();
    expect(requestHeaders3).toMatchObject({
      'sentry-trace': expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})$/),
      baggage: expect.any(String),
    });
  },
);
