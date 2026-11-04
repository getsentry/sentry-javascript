import { SENTRY_OP } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  eventAndTraceHeaderRequestParser,
  getMultipleSentryEnvelopeRequests,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../../utils/helpers';
import {
  getSpanOp,
  waitForStreamedSpanAndTraceHeader,
  waitForStreamedSpanAndTraceHeaderOnUrl,
} from '../../../../utils/spanUtils';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';
const META_TAG_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=0.2,sentry-sampled=true,sentry-transaction=my-transaction,sentry-public_key=public,sentry-release=1.0.0,sentry-environment=prod,sentry-sample_rand=0.42';

sentryTest(
  'create a new trace for a navigation after the <meta> tag pageload trace',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const [pageloadSpan, pageloadTraceHeader] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
    const [navigationSpan, navigationTraceHeader] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, `${url}#foo`);

    expect(pageloadSpan.is_segment).toBe(true);
    expect(pageloadSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
      sample_rand: '0.42',
    });

    expect(navigationSpan.is_segment).toBe(true);
    expect(navigationSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'navigation' } }),
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    // navigation span is head of trace, so there's no parent span:
    expect(navigationSpan).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationSpan?.trace_id,
      sample_rand: expect.any(String),
    });

    expect(pageloadSpan?.trace_id).not.toEqual(navigationSpan?.trace_id);
    expect(pageloadTraceHeader?.sample_rand).not.toEqual(navigationTraceHeader?.sample_rand);
  },
);

sentryTest('error after <meta> tag pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [pageloadSpan, pageloadTraceHeader] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

  expect(pageloadSpan).toMatchObject({
    is_segment: true,
    attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(pageloadTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: '0.42',
  });

  const errorEventPromise = waitForErrorRequest(page).then(eventAndTraceHeaderRequestParser);
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  expect(errorEvent.type).toEqual(undefined);
  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: '0.42',
  });
});

sentryTest('error during <meta> tag pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadPromise = waitForStreamedSpanAndTraceHeader(
    page,
    span => span.is_segment && getSpanOp(span) === 'pageload',
  );
  const errorPromise = waitForErrorRequest(page).then(eventAndTraceHeaderRequestParser);
  await page.goto(url);
  await page.locator('#errorBtn').click();
  const [[pageloadSpan, pageloadTraceHeader], [errorEvent, errorTraceHeader]] = await Promise.all([
    pageloadPromise,
    errorPromise,
  ]);

  expect(pageloadSpan.is_segment).toBe(true);
  expect(pageloadSpan).toMatchObject({
    is_segment: true,
    attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(pageloadTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: '0.42',
  });

  expect(errorEvent.type).toEqual(undefined);
  expect(errorEvent?.contexts?.trace).toEqual({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
    sample_rand: '0.42',
  });
});

sentryTest(
  'outgoing fetch request during <meta> tag pageload has pageload traceId in headers',
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

    const pageloadSpanPromise = waitForStreamedSpanAndTraceHeader(
      page,
      span => span.is_segment && getSpanOp(span) === 'pageload',
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [[pageloadSpan, pageloadTraceHeader], request] = await Promise.all([pageloadSpanPromise, requestPromise]);

    expect(pageloadSpan.is_segment).toBe(true);
    expect(pageloadSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
      sample_rand: '0.42',
    });

    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    // eslint-disable-next-line regexp/prefer-d
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);

sentryTest(
  'outgoing XHR request during <meta> tag pageload has pageload traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    await page.route('http://sentry-test-site.example/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSpanPromise = waitForStreamedSpanAndTraceHeader(
      page,
      span => span.is_segment && getSpanOp(span) === 'pageload',
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [[pageloadSpan, pageloadTraceHeader], request] = await Promise.all([pageloadSpanPromise, requestPromise]);

    expect(pageloadSpan.is_segment).toBe(true);
    expect(pageloadSpan).toMatchObject({
      is_segment: true,
      attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
      sample_rand: '0.42',
    });

    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    // eslint-disable-next-line regexp/prefer-d
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);

sentryTest('user feedback event after pageload has pageload traceId in headers', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest() || shouldSkipFeedbackTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true });

  const [pageloadSpan] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);

  expect(pageloadSpan).toMatchObject({
    is_segment: true,
    attributes: expect.objectContaining({ [SENTRY_OP]: { type: 'string', value: 'pageload' } }),
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  const feedbackEventsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 1, { envelopeType: 'feedback' });

  await page.getByText('Report a Bug').click();
  expect(await page.locator(':visible:text-is("Report a Bug")').count()).toEqual(1);
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const [feedbackEvent] = await feedbackEventsPromise;
  const feedbackTraceContext = feedbackEvent.contexts?.trace;

  expect(feedbackEvent.type).toEqual('feedback');

  expect(feedbackTraceContext).toMatchObject({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
});
