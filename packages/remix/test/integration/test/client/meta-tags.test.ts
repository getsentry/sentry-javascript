import { test, expect } from '@playwright/test';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';
import { Event } from '@sentry/types';

test('should inject `sentry-trace` and `baggage` meta tags inside the root page.', async ({ page, browserName }) => {
  // This test is flaky on firefox
  // https://github.com/getsentry/sentry-javascript/issues/8398
  if (browserName === 'firefox') {
    test.skip();
  }

  await page.goto('/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));
});

test('should inject `sentry-trace` and `baggage` meta tags inside a parameterized route.', async ({
  page,
  browserName,
}) => {
  // This test is flaky on firefox
  // https://github.com/getsentry/sentry-javascript/issues/8398
  if (browserName === 'firefox') {
    test.skip();
  }

  await page.goto('/loader-json-response/0');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));
});

test('should send transactions with corresponding `sentry-trace` and `baggage` inside root page', async ({
  page,
  browserName,
}) => {
  // This test is flaky on firefox
  // https://github.com/getsentry/sentry-javascript/issues/8398
  if (browserName === 'firefox') {
    test.skip();
  }

  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryTraceContent).toContain(
    `${envelope.contexts?.trace.trace_id}-${envelope.contexts?.trace.parent_span_id}-`,
  );

  expect(sentryBaggageContent).toContain(envelope.contexts?.trace.trace_id);
});

test('should send transactions with corresponding `sentry-trace` and `baggage` inside a parameterized route', async ({
  page,
  browserName,
}) => {
  // This test is flaky on firefox
  // https://github.com/getsentry/sentry-javascript/issues/8398
  if (browserName === 'firefox') {
    test.skip();
  }

  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/loader-json-response/0');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryTraceContent).toContain(
    `${envelope.contexts?.trace.trace_id}-${envelope.contexts?.trace.parent_span_id}-`,
  );

  expect(sentryBaggageContent).toContain(envelope.contexts?.trace.trace_id);
});
