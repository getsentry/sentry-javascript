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
    const navigationEvent1 = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    expect(pageloadEvent.contexts?.trace?.op).toBe('pageload');
    expect(navigationEvent1.contexts?.trace?.op).toBe('navigation');

    const pageloadTraceId = pageloadEvent.contexts?.trace?.trace_id;
    const navigation1TraceId = navigationEvent1.contexts?.trace?.trace_id;

    expect(pageloadTraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(navigation1TraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(pageloadTraceId).not.toEqual(navigation1TraceId);
  },
);

sentryTest('error after pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(pageloadEvent.contexts?.trace?.op).toBe('pageload');

  const pageloadTraceId = pageloadEvent.contexts?.trace?.trace_id;
  expect(pageloadTraceId).toMatch(/^[0-9a-f]{32}$/);

  const [, errorEvent] = await Promise.all([
    page.locator('#errorBtn').click(),
    getFirstSentryEnvelopeRequest<Event>(page),
  ]);

  const errorTraceId = errorEvent.contexts?.trace?.trace_id;
  expect(errorTraceId).toBe(pageloadTraceId);
});

sentryTest('error during pageload has pageload traceId', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const envelopeRequestsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);
  await page.goto(url);
  await page.locator('#errorBtn').click();
  const events = await envelopeRequestPromise;

  const pageloadEvent = events.find(event => event.type === 'transaction');
  const errorEvent = events.find(event => !event.type);

  expect(pageloadEvent?.contexts?.trace?.op).toBe('pageload');

  const pageloadTraceId = pageloadEvent?.contexts?.trace?.trace_id;
  expect(pageloadTraceId).toMatch(/^[0-9a-f]{32}$/);

  const errorTraceId = errorEvent?.contexts?.trace?.trace_id;
  expect(errorTraceId).toBe(pageloadTraceId);
});
