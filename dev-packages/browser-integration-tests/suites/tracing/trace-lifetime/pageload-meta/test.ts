import { release } from 'os';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

const META_TAG_TRACE_ID = '12345678901234567890123456789012';
const META_TAG_PARENT_SPAN_ID = '1234567890123456';
const META_TAG_BAGGAGE =
  'sentry-trace_id=12345678901234567890123456789012,sentry-sample_rate=0.2,sentry-sampled=true,sentry-transaction=my-transaction,sentry-public_key=public,sentry-release=1.0.0,sentry-environment=prod';

sentryTest(
  'create a new trace for a navigation after the <meta> tag pageload trace',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

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

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
    });

    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    // navigation span is head of trace, so there's no parent span:
    expect(navigationTraceContext?.trace_id).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
    });

    expect(pageloadTraceContext?.trace_id).not.toEqual(navigationTraceContext?.trace_id);
  },
);

sentryTest('error after <meta> tag pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    url,
    eventAndTraceHeaderRequestParser,
  );

  expect(pageloadEvent.contexts?.trace).toMatchObject({
    op: 'pageload',
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(pageloadTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
  });

  const errorEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );
  await page.locator('#errorBtn').click();
  const [errorEvent, errorTraceHeader] = await errorEventPromise;

  expect(errorEvent.contexts?.trace).toMatchObject({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
  });
});

sentryTest('error during <meta> tag pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

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

  expect(pageloadEvent?.contexts?.trace).toMatchObject({
    op: 'pageload',
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(pageloadTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
  });

  expect(errorEvent?.contexts?.trace).toMatchObject({
    trace_id: META_TAG_TRACE_ID,
    parent_span_id: META_TAG_PARENT_SPAN_ID,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'prod',
    release: '1.0.0',
    sample_rate: '0.2',
    sampled: 'true',
    transaction: 'my-transaction',
    public_key: 'public',
    trace_id: META_TAG_TRACE_ID,
  });
});

sentryTest(
  'outgoing fetch request after <meta> tag pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
    });

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#fetchBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);

sentryTest(
  'outgoing fetch request during <meta> tag pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
    });

    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);

sentryTest(
  'outgoing XHR request after <meta> tag pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const [pageloadEvent, pageloadTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      url,
      eventAndTraceHeaderRequestParser,
    );
    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
    });

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#xhrBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);

sentryTest(
  'outgoing XHR request during <meta> tag pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [[pageloadEvent, pageloadTraceHeader], request] = await Promise.all([pageloadEventPromise, requestPromise]);

    expect(pageloadEvent?.contexts?.trace).toMatchObject({
      op: 'pageload',
      trace_id: META_TAG_TRACE_ID,
      parent_span_id: META_TAG_PARENT_SPAN_ID,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });

    expect(pageloadTraceHeader).toEqual({
      environment: 'prod',
      release: '1.0.0',
      sample_rate: '0.2',
      sampled: 'true',
      transaction: 'my-transaction',
      public_key: 'public',
      trace_id: META_TAG_TRACE_ID,
    });

    const headers = request.headers();

    // sampling decision is propagated from meta tag's sentry-trace sampled flag
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${META_TAG_TRACE_ID}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toBe(META_TAG_BAGGAGE);
  },
);
