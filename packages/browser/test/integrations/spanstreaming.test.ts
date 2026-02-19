import * as SentryCore from '@sentry/core';
import { debug } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { BrowserClient, spanStreamingIntegration } from '../../src';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

// Mock SpanBuffer as a class that can be instantiated
const mockSpanBufferInstance = vi.hoisted(() => ({
  flush: vi.fn(),
  add: vi.fn(),
  drain: vi.fn(),
}));

const MockSpanBuffer = vi.hoisted(() => {
  return vi.fn(() => mockSpanBufferInstance);
});

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    SpanBuffer: MockSpanBuffer,
  };
});

describe('spanStreamingIntegration', () => {
  it('has the correct hooks', () => {
    const integration = spanStreamingIntegration();
    expect(integration.name).toBe('SpanStreaming');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(integration.beforeSetup).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(integration.setup).toBeDefined();
  });

  it('sets traceLifecycle to "stream" if not set', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('logs a warning if traceLifecycle is not set to "stream"', () => {
    const debugSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
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
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      beforeSendSpan: (span: Span) => span,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(debugSpy).toHaveBeenCalledWith(
      'SpanStreaming integration requires a beforeSendSpan callback using `withStreamedSpan`! Falling back to static trace lifecycle.',
    );
    debugSpy.mockRestore();

    expect(client.getOptions().traceLifecycle).toBe('static');
  });

  it('does nothing if traceLifecycle set to "stream"', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('enqueues a span into the buffer when the span ends', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test' });
    client.emit('afterSpanEnd', span);

    expect(mockSpanBufferInstance.add).toHaveBeenCalledWith({
      _segmentSpan: span,
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      end_timestamp: expect.any(Number),
      is_segment: true,
      name: 'test',
      start_timestamp: expect.any(Number),
      status: 'ok',
      attributes: {
        'sentry.origin': {
          type: 'string',
          value: 'manual',
        },
        'sentry.sdk.name': {
          type: 'string',
          value: 'sentry.javascript.browser',
        },
        'sentry.sdk.version': {
          type: 'string',
          value: expect.any(String),
        },
        'sentry.segment.id': {
          type: 'string',
          value: span.spanContext().spanId,
        },
        'sentry.segment.name': {
          type: 'string',
          value: 'test',
        },
      },
    });
  });

  it('flushes the trace when the segment span ends', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test' });
    client.emit('afterSegmentSpanEnd', span);

    expect(mockSpanBufferInstance.flush).toHaveBeenCalledWith(span.spanContext().traceId);
  });
});
