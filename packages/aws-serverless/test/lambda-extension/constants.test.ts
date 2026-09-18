import { MAX_BAGGAGE_STRING_LENGTH } from '@sentry/core';
import { describe, expect, test } from 'vitest';
import {
  ENVELOPE_HEADER_MAX_BYTES,
  POLL_KEEPALIVE_MS,
  MAX_TIMER_DELAY_MS,
  POLL_ESTABLISHED_MS,
  POLL_GIVE_UP_MS,
  POLL_RETRY_BASE_MS,
  POLL_RETRY_MAX_MS,
  SHUTDOWN_BUDGET_MS,
  SHUTDOWN_IDLE_GRACE_MS,
  SHUTDOWN_MARGIN_MS,
  TUNNEL_PORT,
  TUNNEL_URL,
} from '../../src/lambda-extension/constants';

/**
 * Tests import these rather than mirroring them, so retuning a value cannot fail a test that is
 * still describing the right behaviour. What that leaves uncovered is a value retuned into a shape
 * the code no longer works in, which is what these pin — the relationships, not the numbers. The
 * exception is the wire contract, where a change is a break rather than a tuning.
 */
describe('lambda extension constants', () => {
  test('treats a poll that outlasted the longest retry as established', () => {
    // The whole point of the signal: a poll the API held longer than we would ever have waited
    // before retrying is one the API accepted and parked.
    expect(POLL_ESTABLISHED_MS).toBe(POLL_RETRY_MAX_MS);
    expect(POLL_RETRY_BASE_MS).toBeLessThan(POLL_RETRY_MAX_MS);
  });

  test('probes for a dead peer on a cadence the poll loop can actually use', () => {
    // Probing more often than the loop would retry is chatter that buys nothing, and probing less
    // often than it gives up means the detection never arrives in time to matter.
    expect(POLL_KEEPALIVE_MS).toBeGreaterThan(POLL_RETRY_MAX_MS);
    expect(POLL_KEEPALIVE_MS).toBeLessThan(POLL_GIVE_UP_MS);
  });

  test('gives up above the longest invocation Lambda allows', () => {
    // Otherwise an outage spanning one maximum-length invocation trips it on its own.
    expect(POLL_GIVE_UP_MS).toBeGreaterThan(900_000);
  });

  test('fits the drain and its headroom inside the window Lambda allows', () => {
    // Lambda SIGKILLs at the end of the budget, so the grace plus the margin has to leave room for
    // an upload to finish rather than consuming the window on its own.
    expect(SHUTDOWN_IDLE_GRACE_MS + SHUTDOWN_MARGIN_MS).toBeLessThan(SHUTDOWN_BUDGET_MS);
    expect(SHUTDOWN_MARGIN_MS).toBeGreaterThan(0);
  });

  test('parks on the largest delay Node accepts, since anything above it fires at once', () => {
    expect(MAX_TIMER_DELAY_MS).toBe(2 ** 31 - 1);
  });

  test('inflates far enough for any envelope header a well-formed SDK can produce', () => {
    // The header's only unbounded-looking field is the sampling context, and its source baggage is
    // capped by core — so if that cap ever grows past this one, legitimate envelopes start failing
    // to parse and are answered 500.
    expect(ENVELOPE_HEADER_MAX_BYTES).toBeGreaterThan(MAX_BAGGAGE_STRING_LENGTH);
  });

  test('points the SDK at the port the tunnel listens on', () => {
    expect(TUNNEL_URL).toBe(`http://localhost:${TUNNEL_PORT}/envelope`);
  });
});
