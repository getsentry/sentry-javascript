import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
  testingCdnBundle,
} from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest('creates a new trace for a navigation after the initial pageload', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;

  page.goto(`${url}#foo`);

  const navigationSpan = await navigationSpanPromise;

  expect(getSpanOp(pageloadSpan)).toEqual('pageload');
  expect(pageloadSpan.trace_id).toMatch(/^[\da-f]{32}$/);
  expect(pageloadSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(pageloadSpan.parent_span_id).toBeUndefined();

  expect(getSpanOp(navigationSpan)).toEqual('navigation');
  expect(navigationSpan.trace_id).toMatch(/^[\da-f]{32}$/);
  expect(navigationSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(navigationSpan.parent_span_id).toBeUndefined();

  expect(pageloadSpan.span_id).not.toEqual(navigationSpan.span_id);
  expect(pageloadSpan.trace_id).not.toEqual(navigationSpan.trace_id);
});

sentryTest('error after pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;
  const pageloadTraceId = pageloadSpan.trace_id;

  expect(getSpanOp(pageloadSpan)).toEqual('pageload');
  expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);
  expect(pageloadSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(pageloadSpan.parent_span_id).toBeUndefined();

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  const errorTraceContext = errorEvent.contexts?.trace;
  expect(errorEvent.type).toEqual(undefined);

  expect(errorTraceContext).toEqual({
    trace_id: pageloadTraceId,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceId,
    sample_rand: expect.any(String),
  });
});

sentryTest('error during pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );

  await page.goto(url);
  await page.locator('#errorBtn').click();
  const [pageloadSpan, [errorEvent, errorTraceHeader]] = await Promise.all([pageloadSpanPromise, errorEventPromise]);

  const pageloadTraceId = pageloadSpan.trace_id;

  expect(getSpanOp(pageloadSpan)).toEqual('pageload');
  expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);
  expect(pageloadSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(pageloadSpan.parent_span_id).toBeUndefined();

  const errorTraceContext = errorEvent?.contexts?.trace;
  expect(errorEvent.type).toEqual(undefined);

  expect(errorTraceContext).toEqual({
    trace_id: pageloadTraceId,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceId,
    sample_rand: expect.any(String),
  });
});

sentryTest(
  'outgoing fetch request during pageload has pageload traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const pageloadSpanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [pageloadSpanEnvelope, request] = await Promise.all([pageloadSpanEnvelopePromise, requestPromise]);

    const pageloadTraceId = pageloadSpanEnvelope[0].trace?.trace_id;
    const sampleRand = pageloadSpanEnvelope[0].trace?.sample_rand;

    expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sampled=true,sentry-sample_rand=${sampleRand},sentry-sample_rate=1`,
    );
  },
);

sentryTest(
  'outgoing XHR request during pageload has pageload traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || testingCdnBundle());

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const pageloadSpanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'pageload'),
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [pageloadSpanEnvelope, request] = await Promise.all([pageloadSpanEnvelopePromise, requestPromise]);

    const pageloadTraceId = pageloadSpanEnvelope[0].trace?.trace_id;
    const sampleRand = pageloadSpanEnvelope[0].trace?.sample_rand;

    expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sampled=true,sentry-sample_rand=${sampleRand},sentry-sample_rate=1`,
    );
  },
);

sentryTest('user feedback event after pageload has pageload traceId in headers', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest() || shouldSkipFeedbackTest() || testingCdnBundle());

  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  const pageloadSpan = await pageloadSpanPromise;
  const pageloadTraceId = pageloadSpan.trace_id;

  expect(getSpanOp(pageloadSpan)).toEqual('pageload');
  expect(pageloadTraceId).toMatch(/^[\da-f]{32}$/);
  expect(pageloadSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(pageloadSpan.parent_span_id).toBeUndefined();

  const feedbackEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

  await page.getByText('Report a Bug').click();
  expect(await page.locator(':visible:text-is("Report a Bug")').count()).toEqual(1);
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const feedbackEvent = await feedbackEventPromise;

  expect(feedbackEvent.type).toEqual('feedback');

  const feedbackTraceContext = feedbackEvent.contexts?.trace;

  expect(feedbackTraceContext).toMatchObject({
    trace_id: pageloadTraceId,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
});
