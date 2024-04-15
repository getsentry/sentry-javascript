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

  expect(navigationEvent1.contexts?.trace?.op).toBe('navigation');
  expect(navigationEvent2.contexts?.trace?.op).toBe('navigation');

  const navigation1TraceId = navigationEvent1.contexts?.trace?.trace_id;
  const navigation2TraceId = navigationEvent2.contexts?.trace?.trace_id;

  expect(navigation1TraceId).toMatch(/^[0-9a-f]{32}$/);
  expect(navigation2TraceId).toMatch(/^[0-9a-f]{32}$/);
  expect(navigation1TraceId).not.toEqual(navigation2TraceId);
});

sentryTest('error after navigation has navigation traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  // ensure pageload transaction is finished
  await getFirstSentryEnvelopeRequest<Event>(page, url);

  const navigationEvent = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);
  expect(navigationEvent.contexts?.trace?.op).toBe('navigation');

  const navigationTraceId = navigationEvent.contexts?.trace?.trace_id;
  expect(navigationTraceId).toMatch(/^[0-9a-f]{32}$/);

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page);
  await page.locator('#errorBtn').click();
  const errorEvent = await errorEventPromise;

  const errorTraceId = errorEvent.contexts?.trace?.trace_id;
  expect(errorTraceId).toBe(navigationTraceId);
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

  expect(navigationEvent?.contexts?.trace?.op).toBe('navigation');

  const navigationTraceId = navigationEvent?.contexts?.trace?.trace_id;
  expect(navigationTraceId).toMatch(/^[0-9a-f]{32}$/);

  const errorTraceId = errorEvent?.contexts?.trace?.trace_id;
  expect(errorTraceId).toBe(navigationTraceId);
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
    expect(navigationEvent.contexts?.trace?.op).toBe('navigation');

    const navigationTraceId = navigationEvent.contexts?.trace?.trace_id;
    expect(navigationTraceId).toMatch(/^[0-9a-f]{32}$/);

    const requestPromise = page.waitForRequest('http://example.com/*');
    await page.locator('#fetchBtn').click();
    const request = await requestPromise;
    const headers = request.headers();

    // sampling decision is deferred b/c of no active span at the time of request
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

    expect(navigationEvent.contexts?.trace?.op).toBe('navigation');

    const navigationTraceId = navigationEvent.contexts?.trace?.trace_id;
    expect(navigationTraceId).toMatch(/^[0-9a-f]{32}$/);

    const headers = request.headers();

    // sampling decision is propagated from active span sampling decision
    expect(headers['sentry-trace']).toMatch(new RegExp(`^${navigationTraceId}-[0-9a-f]{16}-1$`));
    expect(headers['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=public,sentry-trace_id=${navigationTraceId},sentry-sample_rate=1,sentry-sampled=true`,
    );
  },
);
