import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'should create a new trace for a navigation after the initial pageload',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const navigationEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    const navigationTraceContext = navigationEvent.contexts?.trace;

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    expect(navigationTraceContext).toMatchObject({
      op: 'navigation',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(navigationTraceContext).not.toHaveProperty('parent_span_id');

    expect(pageloadTraceContext?.span_id).not.toEqual(navigationTraceContext?.span_id);
  },
);

sentryTest('error after pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const pageloadTraceContext = pageloadEvent.contexts?.trace;

  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
  await page.locator('#errorBtn').click();
  const errorEvent = await errorEventPromise;

  const errorTraceContext = errorEvent.contexts?.trace;

  expect(errorTraceContext).toEqual({
    trace_id: pageloadTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
});

sentryTest('error during pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);
  await page.goto(url);
  await page.locator('#errorBtn').click();
  const events = await envelopeRequestsPromise;

  const pageloadEvent = events.find(event => event.type === 'transaction');
  const errorEvent = events.find(event => !event.type);

  const pageloadTraceContext = pageloadEvent?.contexts?.trace;
  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  const errorTraceContext = errorEvent?.contexts?.trace;
  expect(errorTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: pageloadTraceContext?.trace_id,
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
});

sentryTest(
  'outgoing fetch request after pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const pageloadTraceContext = pageloadEvent.contexts?.trace;

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#fetchBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is deferred b/c of no active span at the time of request
    const pageloadTraceId = pageloadTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId}`,
    );
  },
);

sentryTest(
  'outgoing fetch request during pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(url);
    await page.locator('#fetchBtn').click();
    const [pageloadEvent, request] = await Promise.all([pageloadEventPromise, requestPromise]);

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    const pageloadTraceId = pageloadTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);

sentryTest(
  'outgoing XHR request after pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const pageloadTraceContext = pageloadEvent.contexts?.trace;

    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#xhrBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is deferred b/c of no active span at the time of request
    const pageloadTraceId = pageloadTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId}`,
    );
  },
);

sentryTest(
  'outgoing XHR request during pageload has pageload traceId in headers',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const pageloadEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.goto(url);
    await page.locator('#xhrBtn').click();
    const [pageloadEvent, request] = await Promise.all([pageloadEventPromise, requestPromise]);

    const pageloadTraceContext = pageloadEvent.contexts?.trace;
    expect(pageloadTraceContext).toMatchObject({
      op: 'pageload',
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    const pageloadTraceId = pageloadTraceContext?.trace_id;
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${pageloadTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${pageloadTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);
