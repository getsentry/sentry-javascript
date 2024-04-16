import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('creates a new trace on each navigation', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationEvent1 = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);
  const navigationEvent2 = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#bar`);

  const navigation1TraceContext = navigationEvent1.contexts?.trace;
  const navigation2TraceContext = navigationEvent2.contexts?.trace;

  expect(navigation1TraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigation1TraceContext).not.toHaveProperty('parent_span_id');

  expect(navigation2TraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigation2TraceContext).not.toHaveProperty('parent_span_id');

  expect(navigation1TraceContext?.trace_id).not.toEqual(navigation2TraceContext?.trace_id);
});

sentryTest('error after navigation has navigation traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

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

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
  await page.locator('#errorBtn').click();
  const errorEvent = await errorEventPromise;

  const errorTraceContext = errorEvent.contexts?.trace;
  expect(errorTraceContext).toEqual({
    trace_id: navigationTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
});

sentryTest('error during navigation has new navigation traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  // ensure navigation transaction is finished
  await getFirstSentryEnvelopeRequest<Event>(page, url);

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);
  await page.goto(`${url}#foo`);
  await page.locator('#errorBtn').click();
  const events = await envelopeRequestsPromise;

  const navigationEvent = events.find(event => event.type === 'transaction');
  const errorEvent = events.find(event => !event.type);

  const navigationTraceContext = navigationEvent?.contexts?.trace;
  expect(navigationTraceContext).toMatchObject({
    op: 'navigation',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

  const errorTraceContext = errorEvent?.contexts?.trace;
  expect(errorTraceContext).toMatchObject({
    op: 'navigation',
    trace_id: errorTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
});

sentryTest(
  'outgoing fetch request after navigation has navigation traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    // ensure navigation transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    const navigationTraceContext = navigationEvent.contexts?.trace;
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#fetchBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is deferred b/c of no active span at the time of request
    const navigationTraceId = navigationTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId}`,
    );
  },
);

sentryTest(
  'outgoing fetch request during navigation has navigation traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    // ensure navigation transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(`${url}#foo`);
    await page.locator('#fetchBtn').click();
    const [navigationEvent, request] = await Promise.all([navigationEventPromise, requestPromise]);

    const navigationTraceContext = navigationEvent.contexts?.trace;
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

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
  'outgoing XHR request after navigation has navigation traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    // ensure navigation transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    const navigationTraceContext = navigationEvent.contexts?.trace;
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    const xhrPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#xhrBtn').click();
    const request = await xhrPromise;
    const headers = request.headers();

    // sampling decision is deferred b/c of no active span at the time of request
    const navigationTraceId = navigationTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId}`,
    );
  },
);

sentryTest(
  'outgoing XHR request during navigation has navigation traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    // ensure navigation transaction is finished
    await getFirstSentryEnvelopeRequest<Event>(page, url);

    const navigationEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(`${url}#foo`);
    await page.locator('#xhrBtn').click();
    const [navigationEvent, request] = await Promise.all([navigationEventPromise, requestPromise]);

    const navigationTraceContext = navigationEvent.contexts?.trace;
    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');
    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    const navigationTraceId = navigationTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);
