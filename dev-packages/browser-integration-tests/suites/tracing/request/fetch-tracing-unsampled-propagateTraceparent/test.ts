import { expect } from '@playwright/test';
import { extractTraceparentData } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'attaches traceparent header to unsampled fetch requests if `propagateTraceparent` is true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, request] = await Promise.all([page.goto(url), page.waitForRequest('http://sentry-test-site.example/0')]);

    const requestHeaders = request.headers();

    const traceparentData = extractTraceparentData(requestHeaders['sentry-trace']);
    expect(traceparentData).toMatchObject({
      traceId: expect.stringMatching(/^([a-f\d]{32})$/),
      parentSpanId: expect.stringMatching(/^([a-f\d]{16})$/),
      parentSampled: false,
    });

    expect(requestHeaders).toMatchObject({
      'sentry-trace': `${traceparentData?.traceId}-${traceparentData?.parentSpanId}-0`,
      traceparent: `00-${traceparentData?.traceId}-${traceparentData?.parentSpanId}-00`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData?.traceId}`),
    });
  },
);
