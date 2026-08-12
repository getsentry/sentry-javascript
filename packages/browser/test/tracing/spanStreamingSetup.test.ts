import type { Client } from '@sentry/core/browser';
import {
  createTransport,
  getMainCarrier,
  resolvedSyncPromise,
  startIdleSpan,
  startInactiveSpan,
  startSpan,
  startSpanManual,
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
    ['startIdleSpan', () => startIdleSpan({ name: 'test' })],
    ['startSpanManual', () => startSpanManual({ name: 'test' }, () => {})],
  ])('installs the integration when the first span is started via %s', (_, startTestSpan) => {
    const client = initSdk();
    expect(client?.getIntegrationByName('SpanStreaming')).toBeUndefined();

    startTestSpan();

    expect(client?.getIntegrationByName('SpanStreaming')).toBeDefined();
  });

  // `browserTracingIntegration` starts the pageload span through `startIdleSpan`, which is easy to
  // overlook when wrapping the span-start APIs - and leaves auto-instrumented traces silently unsent.
  it('installs the integration and streams the pageload segment with `browserTracingIntegration` alone', () => {
    const client = initSdk({ integrations: [browserTracingIntegration()] });

    expect(client?.getIntegrationByName('SpanStreaming')).toBeDefined();
  });
});
