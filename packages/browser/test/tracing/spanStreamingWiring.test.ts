/**
 * @vitest-environment jsdom
 */

import type { Client, Envelope } from '@sentry/core/browser';
import {
  createTransport,
  getMainCarrier,
  resolvedSyncPromise,
  startInactiveSpan,
  startSpan,
} from '@sentry/core/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserOptions } from '../../src';
import { browserTracingIntegration, init } from '../../src';

// These tests cover the wiring between `init`, the span-start APIs and `spanStreamingIntegration`.
// The integration itself is unit tested in `@sentry/core`; what is easy to break - and what nothing
// else covers - is that it gets installed at all now that `init` no longer references it.

function initSdk(options: Partial<BrowserOptions> = {}): Client | undefined {
  return init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
    ...options,
  });
}

function recordEnvelopes(client: Client | undefined): Envelope[] {
  const envelopes: Envelope[] = [];
  vi.spyOn(client!, 'sendEnvelope').mockImplementation(envelope => {
    envelopes.push(envelope);
    return resolvedSyncPromise({});
  });
  return envelopes;
}

/** Pulls the serialized spans out of the span v2 container items of the recorded envelopes. */
function getStreamedSpans(envelopes: Envelope[]): Array<{ name?: string; is_segment?: boolean }> {
  return envelopes
    .flatMap(([, items]) => items)
    .filter(([itemHeader]) => itemHeader.type === 'span')
    .flatMap(([, payload]) => (payload as { items: Array<{ name?: string; is_segment?: boolean }> }).items);
}

describe('span streaming wiring', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('`init` alone does not install the integration', () => {
    const client = initSdk();

    expect(client?.getIntegrationByName('SpanStreaming')).toBeUndefined();
  });

  it('does not install the integration for `traceLifecycle: "static"`, even once a span starts', () => {
    const client = initSdk({ traceLifecycle: 'static' });

    startSpan({ name: 'test' }, () => {});

    expect(client?.getIntegrationByName('SpanStreaming')).toBeUndefined();
  });

  it.each([
    ['startSpan', () => startSpan({ name: 'test' }, () => {})],
    ['startInactiveSpan', () => startInactiveSpan({ name: 'test' }).end()],
  ])('installs the integration when the first span is started via %s', (_, startTestSpan) => {
    const client = initSdk();
    expect(client?.getIntegrationByName('SpanStreaming')).toBeUndefined();

    startTestSpan();

    expect(client?.getIntegrationByName('SpanStreaming')).toBeDefined();
  });

  it('streams and flushes a manually started segment span', () => {
    const client = initSdk();
    const envelopes = recordEnvelopes(client);

    startSpan({ name: 'manual segment' }, () => {});
    // The integration flushes the trace 500ms after the segment span ends.
    vi.advanceTimersByTime(500);

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]![0].trace).toBeDefined();
    expect(getStreamedSpans(envelopes)).toEqual([
      expect.objectContaining({ name: 'manual segment', is_segment: true }),
    ]);
  });

  // `browserTracingIntegration` starts the pageload span through `startIdleSpan`, which is easy to
  // overlook when wrapping the span-start APIs - and leaves auto-instrumented traces silently unsent.
  it('installs the integration and streams the pageload segment with `browserTracingIntegration` alone', () => {
    const client = initSdk({ integrations: [browserTracingIntegration()] });

    expect(client?.getIntegrationByName('SpanStreaming')).toBeDefined();

    const envelopes = recordEnvelopes(client);

    // Let the idle span time out, then let the post-segment flush timer fire.
    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(500);

    expect(getStreamedSpans(envelopes)).toContainEqual(expect.objectContaining({ name: '/', is_segment: true }));
  });
});
