import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import { shouldSkipFeedbackTest } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('creates a new trace on each navigation', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest(page, url);

  const [navigation1Event, navigation1TraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    `${url}#foo`,
    eventAndTraceHeaderRequestParser,
  );
  const [navigation2Event, navigation2TraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    `${url}#bar`,
    eventAndTraceHeaderRequestParser,
  );

  const navigation1TraceContext = navigation1Event.contexts?.trace;
  const navigation2TraceContext = navigation2Event.contexts?.trace;

  expect(navigation1Event.type).toEqual('transaction');
  expect(navigation2Event.type).toEqual('transaction');

  expect(navigation1TraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigation1TraceContext).not.toHaveProperty('parent_span_id');

  expect(navigation1TraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigation1TraceContext?.trace_id,
  });

  expect(navigation2TraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigation2TraceContext).not.toHaveProperty('parent_span_id');

  expect(navigation2TraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigation2TraceContext?.trace_id,
  });

  expect(navigation1TraceContext?.trace_id).not.toEqual(navigation2TraceContext?.trace_id);
});

sentryTest('error after navigation has navigation traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // ensure pageload transaction is finished
  await getFirstSentryEnvelopeRequest<Event>(page, url);

  const [navigationEvent, navigationTraceHeader] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    `${url}#foo`,
    eventAndTraceHeaderRequestParser,
  );
  const navigationTraceContext = navigationEvent.contexts?.trace;

  expect(navigationEvent.type).toEqual('transaction');

  expect(navigationTraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

  expect(navigationTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceContext?.trace_id,
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
    trace_id: navigationTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceContext?.trace_id,
  });
});

sentryTest('error during navigation has new navigation traceId', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // ensure pageload transaction is finished
  await getFirstSentryEnvelopeRequest<Event>(page, url);

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<EventAndTraceHeader>(
    page,
    2,
    undefined,
    eventAndTraceHeaderRequestParser,
  );

  await page.goto(`${url}#foo`);
  await page.locator('#errorBtn').click();
  const envelopes = await envelopeRequestsPromise;

  const [navigationEvent, navigationTraceHeader] = envelopes.find(envelope => envelope[0].type === 'transaction')!;
  const [errorEvent, errorTraceHeader] = envelopes.find(envelope => !envelope[0].type)!;

  expect(navigationEvent.type).toEqual('transaction');
  expect(errorEvent.type).toEqual(undefined);

  const navigationTraceContext = navigationEvent?.contexts?.trace;
  expect(navigationTraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

  expect(navigationTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceContext?.trace_id,
  });

  const errorTraceContext = errorEvent?.contexts?.trace;
  expect(errorTraceContext).toEqual({
    trace_id: navigationTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(errorTraceHeader).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: navigationTraceContext?.trace_id,
  });
});

sentryTest(
  'outgoing fetch request during navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://example.com/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // ensure pageload transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(`${url}#foo`);
    await page.locator('#fetchBtn').click();
    const [[navigationEvent, navigationTraceHeader], request] = await Promise.all([
      navigationEventPromise,
      requestPromise,
    ]);

    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(navigationEvent.type).toEqual('transaction');
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
    });

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    const navigationTraceId = navigationTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);

sentryTest(
  'outgoing XHR request during navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('http://example.com/**', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // ensure navigation transaction is finished
    await getFirstSentryEnvelopeRequest(page, url);

    const navigationEventPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
      page,
      undefined,
      eventAndTraceHeaderRequestParser,
    );
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(`${url}#foo`);
    await page.locator('#xhrBtn').click();
    const [[navigationEvent, navigationTraceHeader], request] = await Promise.all([
      navigationEventPromise,
      requestPromise,
    ]);

    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(navigationEvent.type).toEqual('transaction');
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    expect(navigationTraceHeader).toEqual({
      environment: 'production',
      public_key: 'public',
      sample_rate: '1',
      sampled: 'true',
      trace_id: navigationTraceContext?.trace_id,
    });

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    const navigationTraceId = navigationTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);

sentryTest(
  'user feedback event after navigation has navigation traceId in headers',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest() || shouldSkipFeedbackTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    // ensure pageload transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    const navigationTraceContext = navigationEvent.contexts?.trace;
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

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
      trace_id: navigationTraceContext?.trace_id,
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  },
);
