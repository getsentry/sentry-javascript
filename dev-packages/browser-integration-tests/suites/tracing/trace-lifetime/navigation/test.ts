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

  const [, errorEvent] = await Promise.all([
    page.locator('#errorBtn').click(),
    getFirstSentryEnvelopeRequest<Event>(page),
  ]);

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
  const [, , events] = await Promise.all([
    page.goto(`${url}#foo`),
    page.locator('#errorBtn').click(),
    envelopeRequestsPromise,
  ]);

  const navigationEvent = events.find(event => event.type === 'transaction');
  const errorEvent = events.find(event => !event.type);

  expect(navigationEvent?.contexts?.trace?.op).toBe('navigation');

  const navigationTraceId = navigationEvent?.contexts?.trace?.trace_id;
  expect(navigationTraceId).toMatch(/^[0-9a-f]{32}$/);

  const errorTraceId = errorEvent?.contexts?.trace?.trace_id;
  expect(errorTraceId).toBe(navigationTraceId);
});
