import * as SentryCore from '@sentry/core/browser';
import {
  debug,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS,
} from '@sentry/core/browser';
import { SENTRY_TRACE_LIFECYCLE } from '@sentry/conventions/attributes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient, spanStreamingIntegration, withStaticSpan } from '../../src';
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

vi.mock('@sentry/core/browser', async () => {
  const original = await vi.importActual('@sentry/core/browser');
  return {
    ...original,
    SpanBuffer: MockSpanBuffer,
  };
});

describe('spanStreamingIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct hooks', () => {
    const integration = spanStreamingIntegration();
    expect(integration.name).toBe('SpanStreaming');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(integration.setup).toBeDefined();
  });

  it('does not set up span streaming if traceLifecycle is "static"', () => {
    const debugSpy = vi.spyOn(debug, 'log').mockImplementation(() => {});
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
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
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(MockSpanBuffer).toHaveBeenCalledTimes(1);
    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('still sets up span streaming if beforeSendSpan is wrapped with withStaticSpan', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
      beforeSendSpan: withStaticSpan(span => span),
    });

    SentryCore.setCurrentClient(client);
    client.init();

    expect(MockSpanBuffer).toHaveBeenCalledTimes(1);
    expect(client.getOptions().traceLifecycle).toBe('stream');
  });

  it('enqueues a span into the buffer when the span ends', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test', sampled: true });
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
        [SENTRY_TRACE_LIFECYCLE]: {
          type: 'string',
          value: 'stream',
        },
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
        [SEMANTIC_ATTRIBUTE_SENTRY_SDK_INTEGRATIONS]: {
          type: 'array',
          value: ['SpanStreaming'],
        },
        'sentry.segment.id': {
          type: 'string',
          value: span.spanContext().spanId,
        },
        'sentry.segment.name': {
          type: 'string',
          value: 'test',
        },
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: {
          type: 'string',
          value: 'production',
        },
      },
    });
  });

  it('does not enqueue a span into the buffer when the span is not sampled', () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [spanStreamingIntegration()],
      tracesSampleRate: 1,
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const span = new SentryCore.SentrySpan({ name: 'test', sampled: false });
    client.emit('afterSpanEnd', span);

    expect(mockSpanBufferInstance.add).not.toHaveBeenCalled();
    expect(mockSpanBufferInstance.flush).not.toHaveBeenCalled();
  });

  it('flushes the trace when the segment span ends after a delay for close to finished child spans', () => {
    vi.useFakeTimers();
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

    vi.advanceTimersByTime(500);

    expect(mockSpanBufferInstance.flush).toHaveBeenCalledWith(span.spanContext().traceId);

    vi.useRealTimers();
  });
});
