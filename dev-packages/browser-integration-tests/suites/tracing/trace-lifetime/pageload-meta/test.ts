import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipFeedbackTest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

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

    const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    const [navigationEvent, navigationTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      `${url}#foo`,
      eventAndTraceHeaderRequestParser,
    );

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
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

    expect(navigationEvent.type).toEqual('transaction');
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[\da-f]{32}$/),
      span_id: expect.stringMatching(/^[\da-f]{16}$/),
    });
    // navigation span is head of trace, so there's no parent span:
    expect(navigationTraceContext?.trace_id).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
      sample_rand: expect.any(String),
    });

    expect(pageloadTraceContext?.trace_id).not.toEqual(navigationTraceContext?.trace_id);
    expect(pageloadTraceHeader?.sample_rand).not.toEqual(navigationTraceHeader?.sample_rand);
  },
);

sentryTest('error after <meta> tag pageload has pageload traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    url,
    eventAndTraceHeaderRequestParser,
  );

  expect(pageloadEvent.contexts?.trace).toMatchObject({
    op: 'pageload',
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

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
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

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    2,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.goto(url);
  await page.locator('#errorBtn').click();
  const envelopes = await envelopeRequestsPromise;

  const [pageloadEvent, pageloadTraceHeader] = envelopes.find(
    eventAndHeader => eventAndHeader[0].type === 'transaction',
  )!;
  const [errorEvent, errorTraceHeader] = envelopes.find(eventAndHeader => !eventAndHeader[0].type)!;

  expect(pageloadEvent.type).toEqual('transaction');
  expect(pageloadEvent?.contexts?.trace).toMatchObject({
    op: 'pageload',
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

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
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

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://sentry-test-site.example/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    expect(pageloadEvent.type).toEqual('transaction');
    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
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

  const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const pageloadTraceContext = pageloadEvent.contexts?.trace;

  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });

  const feedbackEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

  await page.getByText('Report a Bug').click();
  expect(await page.locator(':visible:text-is("Report a Bug")').count()).toEqual(1);
  await page.locator('[name="name"]').fill('Jane Doe');
  await page.locator('[name="email"]').fill('janedoe@example.org');
  await page.locator('[name="message"]').fill('my example feedback');
  await page.locator('[data-sentry-feedback] .btn--primary').click();

  const feedbackEvent = await feedbackEventPromise;
  const feedbackTraceContext = feedbackEvent.contexts?.trace;

  expect(feedbackEvent.type).toEqual('feedback');

  expect(feedbackTraceContext).toMatchObject({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[\da-f]{16}$/),
  });
});
