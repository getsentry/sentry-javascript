import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../../../src';
import { SentrySpan, setCurrentClient } from '../../../src';
import { serverSpanStreamingIntegration } from '../../../src/integrations/serverSpanStreaming';
import { debug } from '../../../src/utils/debug-logger';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('serverSpanStreamingIntegration', () => {
  let client: TestClient;
  let sendEnvelopeSpy: ReturnType<typeof vi.fn>;

  const debugWarnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
    sendEnvelopeSpy = vi.fn().mockResolvedValue({});

    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1.0,
        traceLifecycle: 'stream',
      }),
    );
    client.sendEnvelope = sendEnvelopeSpy;
    setCurrentClient(client as Client);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('has the correct name', () => {
    const integration = serverSpanStreamingIntegration();
    expect(integration.name).toBe('ServerSpanStreaming');
  });

  it("doesn't set up if traceLifecycle is not stream", () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1.0,
        traceLifecycle: 'static',
        debug: true,
      }),
    );

    client.sendEnvelope = sendEnvelopeSpy;
    setCurrentClient(client as Client);

    const integration = serverSpanStreamingIntegration();
    integration.setup?.(client);
    client.init();

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    client.emit('afterSpanEnd', segmentSpan);

    // Should not buffer anything because integration didn't set up
    vi.advanceTimersByTime(5000);
    expect(sendEnvelopeSpy).not.toHaveBeenCalled();

    expect(debugWarnSpy).toHaveBeenCalledWith(
      'serverSpanStreamingIntegration requires `traceLifecycle` to be set to "stream"! Falling back to static trace lifecycle.',
    );
    expect(client.getOptions().traceLifecycle).toBe('static');
  });

  it("doesn't set up if beforeSendSpan callback is not a valid v2 callback", () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1.0,
        traceLifecycle: 'stream',
        debug: true,
        beforeSendSpan: span => {
          return span;
        },
      }),
    );
    client.sendEnvelope = sendEnvelopeSpy;
    setCurrentClient(client as Client);

    const integration = serverSpanStreamingIntegration();
    integration.setup?.(client);
    client.init();

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });
    client.emit('afterSpanEnd', segmentSpan);
    expect(debugWarnSpy).toHaveBeenCalledWith(
      'serverSpanStreamingIntegration requires a beforeSendSpan callback using `withStreamSpan`! Falling back to static trace lifecycle.',
    );
    expect(client.getOptions().traceLifecycle).toBe('static');
  });

  it('captures spans on afterSpanEnd hook', () => {
    const integration = serverSpanStreamingIntegration();
    integration.setup?.(client);
    client.init();

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    // Simulate span end which would trigger afterSpanEnd
    client.emit('afterSpanEnd', segmentSpan);

    // Integration should have called captureSpan which emits enqueueSpan
    // Then the buffer should flush on interval
    vi.advanceTimersByTime(5000);

    expect(sendEnvelopeSpy).toHaveBeenCalledOnce();
  });

  it('respects maxSpanLimit option', () => {
    const integration = serverSpanStreamingIntegration({ maxSpanLimit: 1 });
    integration.setup?.(client);
    client.init();

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    // Enqueue span directly (simulating what captureSpan does)
    client.emit('enqueueSpan', {
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    // Should flush immediately since maxSpanLimit is 1
    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
  });

  it('respects flushInterval option', () => {
    const integration = serverSpanStreamingIntegration({ flushInterval: 1000 });
    integration.setup?.(client);
    client.init();

    const segmentSpan = new SentrySpan({ name: 'segment', sampled: true });

    client.emit('enqueueSpan', {
      trace_id: 'trace123',
      span_id: 'span1',
      name: 'test span',
      start_timestamp: Date.now() / 1000,
      end_timestamp: Date.now() / 1000,
      status: 'ok',
      is_segment: false,
      _segmentSpan: segmentSpan,
    });

    expect(sendEnvelopeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(sendEnvelopeSpy).toHaveBeenCalledTimes(1);
  });
});
