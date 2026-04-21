import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest('creates a new trace and sample_rand on each navigation', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  // Wait for and skip the initial pageload span
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  await pageloadSpanPromise;

  const navigation1SpanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
  );
  await page.goto(`${url}#foo`);
  const navigation1SpanEnvelope = await navigation1SpanEnvelopePromise;

  const navigation2SpanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
  );
  await page.goto(`${url}#bar`);
  const navigation2SpanEnvelope = await navigation2SpanEnvelopePromise;

  const navigation1TraceId = navigation1SpanEnvelope[0].trace?.trace_id;
  const navigation1SampleRand = navigation1SpanEnvelope[0].trace?.sample_rand;
  const navigation2TraceId = navigation2SpanEnvelope[0].trace?.trace_id;
  const navigation2SampleRand = navigation2SpanEnvelope[0].trace?.sample_rand;

  const navigation1Span = navigation1SpanEnvelope[1][0][1].items.find(s => getSpanOp(s) === 'navigation')!;
  const navigation2Span = navigation2SpanEnvelope[1][0][1].items.find(s => getSpanOp(s) === 'navigation')!;

  expect(getSpanOp(navigation1Span)).toEqual('navigation');
  expect(navigation1TraceId).toMatch(/^[\da-f]{32}$/);
  expect(navigation1Span.span_id).toMatch(/^[\da-f]{16}$/);
  expect(navigation1Span.parent_span_id).toBeUndefined();

  expect(navigation1SpanEnvelope[0].trace).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigation1TraceId,
    sample_rand: expect.any(String),
  });

  expect(getSpanOp(navigation2Span)).toEqual('navigation');
  expect(navigation2TraceId).toMatch(/^[\da-f]{32}$/);
  expect(navigation2Span.span_id).toMatch(/^[\da-f]{16}$/);
  expect(navigation2Span.parent_span_id).toBeUndefined();

  expect(navigation2SpanEnvelope[0].trace).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigation2TraceId,
    sample_rand: expect.any(String),
  });

  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
  expect(navigation1SampleRand).not.toEqual(navigation2SampleRand);
});

sentryTest('error after navigation has navigation traceId', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  // ensure pageload span is finished
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  await pageloadSpanPromise;

  const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
  const navigationSpanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
  );
  await page.goto(`${url}#foo`);
  const [navigationSpan, navigationSpanEnvelope] = await Promise.all([
    navigationSpanPromise,
    navigationSpanEnvelopePromise,
  ]);

  const navigationTraceId = navigationSpan.trace_id;

  expect(getSpanOp(navigationSpan)).toEqual('navigation');
  expect(navigationTraceId).toMatch(/^[\da-f]{32}$/);
  expect(navigationSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(navigationSpan.parent_span_id).toBeUndefined();

  expect(navigationSpanEnvelope[0].trace).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceId,
    sample_rand: expect.any(String),
  });

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  expect(errorEvent.type).toEqual(undefined);

  const errorTraceContext = errorEvent.contexts?.trace;
  expect(errorTraceContext).toEqual({
    trace_id: navigationTraceId,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceId,
    sample_rand: expect.any(String),
  });
});

sentryTest('error during navigation has new navigation traceId', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  // ensure pageload span is finished
  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
  await page.goto(url);
  await pageloadSpanPromise;

  const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );

  await page.goto(`${url}#foo`);
  await page.locator('#errorBtn').click();
  const [navigationSpan, [errorEvent, errorTraceHeader]] = await Promise.all([
    navigationSpanPromise,
    errorEventPromise,
  ]);

  expect(getSpanOp(navigationSpan)).toEqual('navigation');
  expect(errorEvent.type).toEqual(undefined);

  const navigationTraceId = navigationSpan.trace_id;
  expect(navigationTraceId).toMatch(/^[\da-f]{32}$/);
  expect(navigationSpan.span_id).toMatch(/^[\da-f]{16}$/);
  expect(navigationSpan.parent_span_id).toBeUndefined();

  const errorTraceContext = errorEvent?.contexts?.trace;
  expect(errorTraceContext).toEqual({
    trace_id: navigationTraceId,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceId,
    sample_rand: expect.any(String),
  });
});

sentryTest(
  'outgoing fetch request during navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // ensure pageload span is finished
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    await pageloadSpanPromise;

    const navigationSpanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(`${url}#foo`);
    await page.locator('#fetchBtn').click();
    const [navigationSpanEnvelope, request] = await Promise.all([navigationSpanEnvelopePromise, requestPromise]);

    const navigationTraceId = navigationSpanEnvelope[0].trace?.trace_id;
    const sampleRand = navigationSpanEnvelope[0].trace?.sample_rand;

    expect(navigationTraceId).toMatch(/^[\da-f]{32}$/);

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sampled=true,sentry-sample_rand=${sampleRand},sentry-sample_rate=1`,
    );
  },
);

sentryTest(
  'outgoing XHR request during navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // ensure navigation span is finished
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    await pageloadSpanPromise;

    const navigationSpanEnvelopePromise = waitForStreamedSpanEnvelope(
      page,
      env => !!env[1][0][1].items.find(s => getSpanOp(s) === 'navigation'),
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(`${url}#foo`);
    await page.locator('#xhrBtn').click();
    const [navigationSpanEnvelope, request] = await Promise.all([navigationSpanEnvelopePromise, requestPromise]);

    const navigationTraceId = navigationSpanEnvelope[0].trace?.trace_id;
    const sampleRand = navigationSpanEnvelope[0].trace?.sample_rand;

    expect(navigationTraceId).toMatch(/^[\da-f]{32}$/);

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sampled=true,sentry-sample_rand=${sampleRand},sentry-sample_rate=1`,
    );
  },
);

sentryTest(
  'user feedback event after navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest() || shouldSkipFeedbackTest());

    const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

    // ensure pageload span is finished
    const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');
    await page.goto(url);
    await pageloadSpanPromise;

    const navigationSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'navigation');
    await page.goto(`${url}#foo`);
    const navigationSpan = await navigationSpanPromise;

    const navigationTraceId = navigationSpan.trace_id;
    expect(getSpanOp(navigationSpan)).toEqual('navigation');
    expect(navigationTraceId).toMatch(/^[\da-f]{32}$/);
    expect(navigationSpan.span_id).toMatch(/^[\da-f]{16}$/);
    expect(navigationSpan.parent_span_id).toBeUndefined();

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
      trace_id: navigationTraceId,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
  },
);
