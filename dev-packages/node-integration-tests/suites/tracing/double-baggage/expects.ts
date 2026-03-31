import { expect } from 'vitest';
import { extractTraceparentData, parseBaggageHeader, TRACEPARENT_REGEXP } from '@sentry/core';

export function expectNoDuplicateSentryBaggageKeys(baggage: string | string[] | undefined): void {
  expect(baggage).toBeDefined();
  const baggageStr = Array.isArray(baggage) ? baggage.join(',') : (baggage as string);
  const sentryEntries = baggageStr.split(',').filter(entry => entry.trim().startsWith('sentry-'));
  const sentryKeyNames = sentryEntries.map(entry => entry.trim().split('=')[0]);
  const uniqueKeyNames = [...new Set(sentryKeyNames)];
  expect(sentryKeyNames).toEqual(uniqueKeyNames);
}

export function expectConsistentTraceId(headers: Record<string, string | string[] | undefined>): void {
  const sentryTrace = headers['sentry-trace'];
  expect(sentryTrace).toMatch(TRACEPARENT_REGEXP);

  const sentryTraceData = extractTraceparentData(sentryTrace as string)!;
  expect(sentryTraceData.traceId).toMatch(/^[a-f\d]{32}$/);

  const baggage = parseBaggageHeader(headers['baggage']);

  const baggageTraceId = baggage!['sentry-trace_id'];
  expect(baggageTraceId).toBeDefined();
  expect(baggageTraceId).toMatch(/^[a-f\d]{32}$/);

  expect(sentryTraceData.traceId).toEqual(baggageTraceId);
}

export function expectUserSetTraceId(headers: Record<string, string | string[] | undefined>): void {
  const xSentryTrace = extractTraceparentData(headers['x-tracedata-sentry-trace'] as string);
  const sentryTrace = extractTraceparentData(headers['sentry-trace'] as string);
  expect(xSentryTrace?.traceId).toBe(sentryTrace?.traceId);

  const xBaggage = parseBaggageHeader(headers['x-tracedata-baggage']);
  const baggage = parseBaggageHeader(headers['baggage']);
  expect(xBaggage).toEqual(baggage);
}
