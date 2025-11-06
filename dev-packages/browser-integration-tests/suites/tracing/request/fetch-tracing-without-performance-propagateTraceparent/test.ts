import { expect } from '@playwright/test';
import { extractTraceparentData } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'attaches traceparent header to tracing without performance (TWP) fetch requests, if `propagateTraceparent` is true',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [, request0, request1] = await Promise.all([
      page.goto(url),
      page.waitForRequest('http://sentry-test-site.example/0'),
      page.waitForRequest('http://sentry-test-site.example/1'),
    ]);

    const requestHeaders0 = request0.headers();

    const traceparentData = extractTraceparentData(requestHeaders0['sentry-trace']);
    expect(traceparentData).toMatchObject({
      traceId: expect.stringMatching(/^([a-f\d]{32})$/),
      parentSpanId: expect.stringMatching(/^([a-f\d]{16})$/),
      parentSampled: undefined,
    });

    expect(requestHeaders0).toMatchObject({
      'sentry-trace': `${traceparentData?.traceId}-${traceparentData?.parentSpanId}`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData?.traceId}`),
      traceparent: `00-${traceparentData?.traceId}-${traceparentData?.parentSpanId}-00`,
    });

    const requestHeaders1 = request1.headers();
    expect(requestHeaders1).toMatchObject({
      'sentry-trace': `${traceparentData?.traceId}-${traceparentData?.parentSpanId}`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData?.traceId}`),
      traceparent: `00-${traceparentData?.traceId}-${traceparentData?.parentSpanId}-00`,
    });

    expect(requestHeaders1['sentry-trace']).toBe(requestHeaders0['sentry-trace']);
    expect(requestHeaders1['baggage']).toBe(requestHeaders0['baggage']);
    expect(requestHeaders1['traceparent']).toBe(requestHeaders0['traceparent']);
  },
);
