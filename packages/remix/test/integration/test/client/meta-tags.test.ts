import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getFirstSentryEnvelopeRequest } from './utils/helpers';

// With Server-Timing headers as the primary trace propagation method,
// meta tags are no longer injected in Node.js/Cloudflare environments.

test('should NOT inject `sentry-trace` and `baggage` meta tags inside the root page (Server-Timing is used instead)', async ({
  page,
}) => {
  await page.goto('/');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  // Meta tags should not be present - Server-Timing headers are used instead
  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should NOT inject `sentry-trace` and `baggage` meta tags inside a parameterized route (Server-Timing is used instead)', async ({
  page,
}) => {
  await page.goto('/loader-json-response/0');

  const sentryTraceTag = await page.$('meta[name="sentry-trace"]');
  const sentryBaggageTag = await page.$('meta[name="baggage"]');

  // Meta tags should not be present - Server-Timing headers are used instead
  expect(sentryTraceTag).toBeNull();
  expect(sentryBaggageTag).toBeNull();
});

test('should send pageload transaction with valid trace context from Server-Timing (root page)', async ({ page }) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/');

  // Verify trace propagation worked - transaction should have valid trace context
  expect(envelope.contexts?.trace?.trace_id).toHaveLength(32);
  expect(envelope.contexts?.trace?.parent_span_id).toHaveLength(16);
  expect(envelope.contexts?.trace?.op).toBe('pageload');
});

test('should send pageload transaction with valid trace context from Server-Timing (parameterized route)', async ({
  page,
}) => {
  const envelope = await getFirstSentryEnvelopeRequest<Event>(page, '/loader-json-response/0');

  // Verify trace propagation worked - transaction should have valid trace context
  expect(envelope.contexts?.trace?.trace_id).toHaveLength(32);
  expect(envelope.contexts?.trace?.parent_span_id).toHaveLength(16);
  expect(envelope.contexts?.trace?.op).toBe('pageload');
});
