import { expect } from '@playwright/test';
import { extractTraceparentData } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest(
  'attaches traceparent header to XHR requests if `propagateTraceparent` is true',
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
    const traceparentData1 = extractTraceparentData(requestHeaders1['sentry-trace']);
    expect(traceparentData1).toMatchObject({
      traceId: expect.stringMatching(/^([a-f\d]{32})$/),
      parentSpanId: expect.stringMatching(/^([a-f\d]{16})$/),
      parentSampled: true,
    });

    expect(requestHeaders1).toMatchObject({
      'sentry-trace': `${traceparentData1?.traceId}-${traceparentData1?.parentSpanId}-1`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData1?.traceId}`),
      traceparent: `00-${traceparentData1?.traceId}-${traceparentData1?.parentSpanId}-01`,
    });

    const request2 = requests[1];
    const requestHeaders2 = request2.headers();
    const traceparentData2 = extractTraceparentData(requestHeaders2['sentry-trace']);
    expect(requestHeaders2).toMatchObject({
      'sentry-trace': `${traceparentData2?.traceId}-${traceparentData2?.parentSpanId}-1`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData2?.traceId}`),
      traceparent: `00-${traceparentData2?.traceId}-${traceparentData2?.parentSpanId}-01`,
      'x-test-header': 'existing-header',
    });

    const request3 = requests[2];
    const requestHeaders3 = request3.headers();
    const traceparentData3 = extractTraceparentData(requestHeaders3['sentry-trace']);
    expect(requestHeaders3).toMatchObject({
      'sentry-trace': `${traceparentData3?.traceId}-${traceparentData3?.parentSpanId}-1`,
      baggage: expect.stringContaining(`sentry-trace_id=${traceparentData3?.traceId}`),
      traceparent: `00-${traceparentData3?.traceId}-${traceparentData3?.parentSpanId}-01`,
    });
  },
);
