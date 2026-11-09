import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentScope } from '../../../src/currentScopes';
import { setCurrentClient } from '../../../src/sdk';
import { ServerRuntimeClient } from '../../../src/server-runtime-client';
import { SentrySpan } from '../../../src/tracing/sentrySpan';
import { createTransport } from '../../../src/transports/base';
import type { TransactionEvent } from '../../../src/types/event';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('__SENTRY_EXCLUDE_STATIC_LIFECYCLE__', () => {
  beforeEach(() => {
    vi.stubGlobal('__SENTRY_EXCLUDE_STATIC_LIFECYCLE__', true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores `traceLifecycle: "static"`', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'static' }));

    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('hands segment spans to span streaming instead of capturing a transaction', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'static', tracesSampleRate: 1 }));
    setCurrentClient(client);
    const onSegmentSpanEnd = vi.fn();
    client.on('afterSegmentSpanEnd', onSegmentSpanEnd);
    const captureEventSpy = vi.spyOn(getCurrentScope(), 'captureEvent');

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true, startTimestamp: 1 });
    segmentSpan.end(2);

    expect(onSegmentSpanEnd).toHaveBeenCalledWith(segmentSpan);
    expect(captureEventSpy).not.toHaveBeenCalled();
  });

  it('does not run transaction processing on transaction events', async () => {
    const beforeSendTransaction = vi.fn(event => event);
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://username@domain/123', beforeSendTransaction }),
    );
    const event: TransactionEvent = { type: 'transaction', transaction: 'test', spans: [] };

    client.captureEvent(event);
    await client.flush();

    expect(beforeSendTransaction).not.toHaveBeenCalled();
  });

  it('adds the span streaming integration to server clients with `traceLifecycle: "static"`', () => {
    const client = new ServerRuntimeClient({
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
      traceLifecycle: 'static',
    });

    expect(client.getOptions().integrations.map(integration => integration.name)).toContain('SpanStreaming');
  });
});
