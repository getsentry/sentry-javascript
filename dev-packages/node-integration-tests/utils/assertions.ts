import type {
  ClientReport,
  Envelope,
  Event,
  SerializedCheckIn,
  SerializedLogContainer,
  SerializedMetricContainer,
  SerializedSession,
  SessionAggregates,
  TransactionEvent,
} from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { expect } from 'vitest';

/**
 * Asserts against a Sentry Event ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryEvent = (actual: Event, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    ...expected,
  });
};

/**
 * Asserts against a Sentry Transaction ignoring non-deterministic properties
 *
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} expected
 */
export const assertSentryTransaction = (actual: TransactionEvent, expected: Record<string, unknown>): void => {
  expect(actual).toMatchObject({
    event_id: expect.any(String),
    timestamp: expect.anything(),
    start_timestamp: expect.anything(),
    spans: expect.any(Array),
    type: 'transaction',
    ...expected,
  });
};

export function assertSentrySession(actual: SerializedSession, expected: Partial<SerializedSession>): void {
  expect(actual).toMatchObject({
    sid: expect.any(String),
    ...expected,
  });
}

export function assertSentrySessions(actual: SessionAggregates, expected: Partial<SessionAggregates>): void {
  expect(actual).toMatchObject({
    ...expected,
  });
}

export function assertSentryCheckIn(actual: SerializedCheckIn, expected: Partial<SerializedCheckIn>): void {
  expect(actual).toMatchObject({
    check_in_id: expect.any(String),
    ...expected,
  });
}

export function assertSentryClientReport(actual: ClientReport, expected: Partial<ClientReport>): void {
  expect(actual).toMatchObject({
    ...expected,
  });
}

export function assertSentryLogContainer(
  actual: SerializedLogContainer,
  expected: Partial<SerializedLogContainer>,
): void {
  expect(actual).toMatchObject({
    ...expected,
  });
}

export function assertSentryMetricContainer(
  actual: SerializedMetricContainer,
  expected: Partial<SerializedMetricContainer>,
): void {
  expect(actual).toMatchObject({
    ...expected,
  });
}

export function assertEnvelopeHeader(actual: Envelope[0], expected: Partial<Envelope[0]>): void {
  expect(actual).toEqual({
    event_id: expect.any(String),
    sent_at: expect.any(String),
    sdk: {
      name: 'sentry.javascript.node',
      version: SDK_VERSION,
    },
    ...expected,
  });
}
