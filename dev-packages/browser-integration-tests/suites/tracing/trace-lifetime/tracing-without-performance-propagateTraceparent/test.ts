import { expect } from '@playwright/test';
import { extractTraceparentData } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';
const META_TAG_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-public_key=public,sentry-release=1.0.0,sentry-environment=prod,sentry-sample_rand=0.42';

sentryTest(
  'outgoing fetch requests have new traceId after navigation (with propagateTraceparent)',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto(url);

    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.locator('#fetchBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    const sentryTraceParentData = extractTraceparentData(headers['sentry-trace']);
    // sampling decision is deferred because TwP means we didn't sample any span
    expect(sentryTraceParentData).toEqual({
      traceId: META_TAG_TRACE_ID,
      parentSpanId: expect.stringMatching(/^[\da-f]{16}$/),
      parentSampled: undefined,
    });
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
    // but traceparent propagates a negative sampling decision because it has no concept of deferred sampling
    expect(headers['traceparent']).toBe(
      `00-${sentryTraceParentData?.traceId}-${sentryTraceParentData?.parentSpanId}-00`,
    );

    const requestPromise2 = page.waitForRequest('http://sentry-test-site.example/*');
    await page.locator('#fetchBtn').click();
    const request2 = await requestPromise2;
    const headers2 = request2.headers();

    const sentryTraceParentData2 = extractTraceparentData(headers2['sentry-trace']);
    expect(sentryTraceParentData2).toEqual(sentryTraceParentData);

    await page.goto(`${url}#navigation`);

    const requestPromise3 = page.waitForRequest('http://sentry-test-site.example/*');
    await page.locator('#fetchBtn').click();
    const request3 = await requestPromise3;
    const headers3 = request3.headers();

    const sentryTraceParentData3 = extractTraceparentData(headers3['sentry-trace']);
    // sampling decision is deferred because TwP means we didn't sample any span
    expect(sentryTraceParentData3).toEqual({
      traceId: expect.not.stringContaining(sentryTraceParentData!.traceId!),
      parentSpanId: expect.not.stringContaining(sentryTraceParentData!.parentSpanId!),
      parentSampled: undefined,
    });

    expect(headers3['baggage']).toMatch(
      /sentry-environment=production,sentry-public_key=public,sentry-trace_id=[\da-f]{32}/,
    );
    expect(headers3['baggage']).not.toContain(`sentry-trace_id=${META_TAG_TRACE_ID}`);
    // but traceparent propagates a negative sampling decision because it has no concept of deferred sampling
    expect(headers3['traceparent']).toBe(
      `00-${sentryTraceParentData3!.traceId}-${sentryTraceParentData3!.parentSpanId}-00`,
    );

    const requestPromise4 = page.waitForRequest('http://sentry-test-site.example/*');
    await page.locator('#fetchBtn').click();
    const request4 = await requestPromise4;
    const headers4 = request4.headers();

    const sentryTraceParentData4 = extractTraceparentData(headers4['sentry-trace']);
    expect(sentryTraceParentData4).toEqual(sentryTraceParentData3);
  },
);

sentryTest('outgoing XHR requests have new traceId after navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://sentry-test-site.example/**', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto(url);

  const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#xhrBtn').click();
  const request = await requestPromise;
  const headers = request.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  // eslint-disable-next-line regexp/prefer-d
  expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}$`));
  expect(headers['baggage']).toBe(META_TAG_BAGGAGE);

  await page.goto(`${url}#navigation`);

  const requestPromise2 = page.waitForRequest('http://sentry-test-site.example/*');
  await page.locator('#xhrBtn').click();
  const request2 = await requestPromise2;
  const headers2 = request2.headers();

  // sampling decision is deferred because TwP means we didn't sample any span
  expect(headers2['sentry-trace']).toMatch(/^[\da-f]{32}-[\da-f]{16}$/);
  expect(headers2['baggage']).not.toBe(`${META_TAG_TRACE_ID}-${META_TAG_PARENT_SPAN_ID}`);
  expect(headers2['baggage']).toMatch(
    /sentry-environment=production,sentry-public_key=public,sentry-trace_id=[\da-f]{32}/,
  );
  expect(headers2['baggage']).not.toContain(`sentry-trace_id=${META_TAG_TRACE_ID}`);
});
