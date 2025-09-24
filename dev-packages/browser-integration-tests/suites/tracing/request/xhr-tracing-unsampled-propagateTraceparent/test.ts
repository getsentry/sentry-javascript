import { expect } from '@playwright/test';
import { extractTraceparentData } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'attaches traceparent header to unsampled xhr requests, if `propagateTraceparent` is true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, request] = await Promise.all([page.goto(url), page.waitForRequest('http://sentry-test-site.example/0')]);

    const requestHeaders1 = request.headers();
    const traceparentData = extractTraceparentData(requestHeaders1['sentry-trace']);
    expect(requestHeaders1).toMatchObject({
      'sentry-trace': `${traceparentData?.traceId}-${traceparentData?.parentSpanId}-0`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData?.traceId}`),
      traceparent: `00-${traceparentData?.traceId}-${traceparentData?.parentSpanId}-00`,
    });
  },
);
