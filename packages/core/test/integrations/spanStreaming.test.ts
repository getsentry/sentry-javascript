import * as SentryCore from '../../src';
import { debug } from '../../src';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spanStreamingIntegration } from '../../src/integrations/spanStreaming';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';

const mockSpanBufferInstance = vi.hoisted(() => ({
  flush: vi.fn(),
  add: vi.fn(),
  drain: vi.fn(),
}));

const MockSpanBuffer = vi.hoisted(() => {
  return vi.fn(() => mockSpanBufferInstance);
});

vi.mock('../../src/tracing/spans/spanBuffer', async () => {
  const original = await vi.importActual('../../src/tracing/spans/spanBuffer');
  return {
    ...original,
    SpanBuffer: MockSpanBuffer,
  };
});

describe('spanStreamingIntegration (core)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct name and setup hook', () => {
    const integration = spanStreamingIntegration();
    expect(integration.name).toBe('SpanStreaming');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(integration.setup).toBeDefined();
  });

  it('logs a warning if traceLifecycle is not set to "stream"', () => {
    const debugSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'static',
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(debugSpy).toHaveBeenCalledWith(
      'SpanStreaming integration requires `traceLifecycle` to be set to "stream"! Falling back to static trace lifecycle.',
    );
    debugSpy.mockRestore();

    expect(client.getOptions().traceLifecycle).toBe('static');
  });

  it('falls back to static trace lifecycle if beforeSendSpan is not compatible with span streaming', () => {
    const debugSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      beforeSendSpan: (span: SentryCore.SpanJSON) => span,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(debugSpy).toHaveBeenCalledWith(
      'SpanStreaming integration requires a beforeSendSpan callback using `withStreamedSpan`! Falling back to static trace lifecycle.',
    );
    debugSpy.mockRestore();

    expect(client.getOptions().traceLifecycle).toBe('static');
  });

  it('sets up buffer when traceLifecycle is "stream"', () => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(MockSpanBuffer).toHaveBeenCalledWith(client);
    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('enqueues a span into the buffer when the span ends', () => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test', sampled: true });
    client.emit('afterSpanEnd', span);

    expect(mockSpanBufferInstance.add).toHaveBeenCalledWith(
      expect.objectContaining({
        _segmentSpan: span,
        trace_id: span.spanContext().traceId,
        span_id: span.spanContext().spanId,
        name: 'test',
      }),
    );
  });

  it('does not enqueue a span into the buffer when the span is not sampled', () => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test', sampled: false });
    client.emit('afterSpanEnd', span);

    expect(mockSpanBufferInstance.add).not.toHaveBeenCalled();
  });
});
