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

  it('does not set up span streaming if traceLifecycle is "static"', () => {
    const debugSpy = vi.spyOn(debug, 'log').mockImplementation(() => {});
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'static',
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(debugSpy).toHaveBeenCalledWith('[SpanStreaming] `traceLifecycle` is "static", skipping setup.');
    debugSpy.mockRestore();

    expect(MockSpanBuffer).not.toHaveBeenCalled();

    // Without the hooks registered, ending a span must not enqueue anything
    client.emit('afterSpanEnd', new SentryCore.SentrySpan({ name: 'test', sampled: true }));
    expect(mockSpanBufferInstance.add).not.toHaveBeenCalled();
  });

  it.each([
    ['explicitly set to "stream"', 'stream' as const],
    ['left unset', undefined],
  ])('sets up span streaming if traceLifecycle is %s', (_, traceLifecycle) => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(MockSpanBuffer).toHaveBeenCalledWith(client);
    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('still sets up span streaming if beforeSendSpan is wrapped with withStaticSpan', () => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      beforeSendSpan: SentryCore.withStaticSpan(span => span),
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

  it('flushes a single trace when the flushTraceSpans hook is emitted', () => {
    const client = new TestClient({
      ...getDefaultTestClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    client.emit('flushTraceSpans', 'trace-1');

    expect(mockSpanBufferInstance.flush).toHaveBeenCalledTimes(1);
    expect(mockSpanBufferInstance.flush).toHaveBeenCalledWith('trace-1');
    expect(mockSpanBufferInstance.drain).not.toHaveBeenCalled();
  });
});
