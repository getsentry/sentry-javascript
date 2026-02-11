import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';

test('should inject `sentry-trace` and `baggage` meta tags inside the root page.', async ({ page }) => {
  await page.goto('/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');

  expect(sentryTraceContent).toEqual(expect.any(String));

  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryBaggageContent).toEqual(expect.any(String));
});

test('should inject `sentry-trace` and `baggage` meta tags inside a parameterized route.', async ({ page }) => {
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
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryTraceContent).toContain(
    `${envelope.contexts?.trace?.trace_id}-${envelope.contexts?.trace?.parent_span_id}-`,
  );

  expect(sentryBaggageContent).toContain(envelope.contexts?.trace?.trace_id);
});

test('should send transactions with corresponding `sentry-trace` and `baggage` inside a parameterized route', async ({
  page,
}) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/loader-json-response/0');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryTraceContent = await sentryTraceTag?.getAttribute('content');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');
  const sentryBaggageContent = await sentryBaggageTag?.getAttribute('content');

  expect(sentryTraceContent).toContain(
    `${envelope.contexts?.trace?.trace_id}-${envelope.contexts?.trace?.parent_span_id}-`,
  );

  expect(sentryBaggageContent).toContain(envelope.contexts?.trace?.trace_id);
});
