// @vitest-environment jsdom
import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { Client, Span } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTraceMetaTagLink,
  canWaitForTraceMetaTag,
  getServerRenderingType,
  observeLateTraceMetaTag,
  readTraceMetaTags,
  waitForTraceMetaTag,
} from '../../src/client/routing/traceMetaTags';

const HEAD_TRACE = '11111111111111111111111111111111-1111111111111111-1';
const BODY_TRACE = '22222222222222222222222222222222-2222222222222222-1';

function appendMeta(parent: HTMLElement, name: string, content: string): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  parent.appendChild(meta);
  return meta;
}

function setServerTimingTrace(sentryTrace: string): void {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { serverTiming: [{ name: 'sentry-trace', description: sentryTrace, duration: 0 }] } as unknown as PerformanceEntry,
  ]);
}

const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');

function setReadyState(value: DocumentReadyState): void {
  Object.defineProperty(document, 'readyState', { value, configurable: true });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.stubEnv('_sentryCacheComponents', 'true');
});

afterEach(() => {
  // @ts-expect-error deleting the instance override restores the prototype getter
  delete document.readyState;
  if (originalReadyState) {
    Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('readTraceMetaTags', () => {
  it('returns nothing for a document without trace meta tags', () => {
    expect(readTraceMetaTags()).toBeUndefined();
  });

  it('reads a tag from <head>', () => {
    appendMeta(document.head, 'sentry-trace', HEAD_TRACE);
    appendMeta(document.head, 'baggage', 'sentry-trace_id=1111');

    expect(readTraceMetaTags()).toEqual({ sentryTrace: HEAD_TRACE, baggage: 'sentry-trace_id=1111' });
    expect(document.querySelectorAll('meta[name="sentry-trace"]')).toHaveLength(1);
  });

  it('reads a tag from <body>', () => {
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);

    expect(readTraceMetaTags()).toEqual({ sentryTrace: BODY_TRACE, baggage: undefined });
  });

  it('prefers the last tag in document order', () => {
    appendMeta(document.head, 'sentry-trace', HEAD_TRACE);
    appendMeta(document.head, 'baggage', 'sentry-trace_id=1111');
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    appendMeta(document.body, 'baggage', 'sentry-trace_id=2222');

    expect(readTraceMetaTags()).toEqual({ sentryTrace: BODY_TRACE, baggage: 'sentry-trace_id=2222' });
  });
});

describe('canWaitForTraceMetaTag', () => {
  it('is true while the document streams and no Server-Timing trace exists', () => {
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    expect(canWaitForTraceMetaTag()).toBe(true);
  });

  it('is false when the build did not enable cacheComponents', () => {
    vi.stubEnv('_sentryCacheComponents', '');
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    expect(canWaitForTraceMetaTag()).toBe(false);
  });

  it('is false once the document finished parsing', () => {
    setReadyState('interactive');

    expect(canWaitForTraceMetaTag()).toBe(false);
  });

  it('is false when the response carried the trace in Server-Timing', () => {
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { serverTiming: [{ name: 'sentry-trace', description: BODY_TRACE, duration: 0 }] } as unknown as PerformanceEntry,
    ]);

    expect(canWaitForTraceMetaTag()).toBe(false);
  });
});

describe('waitForTraceMetaTag', () => {
  beforeEach(() => {
    setReadyState('loading');
    vi.useFakeTimers();
  });

  it('reports a tag that is streamed in after the SDK started, once', async () => {
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    waitForTraceMetaTag(onTag, onGiveUp, 1000);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    appendMeta(document.body, 'baggage', 'sentry-trace_id=2222');
    await vi.advanceTimersByTimeAsync(0);
    appendMeta(document.body, 'sentry-trace', HEAD_TRACE);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(onTag).toHaveBeenCalledTimes(1);
    expect(onTag).toHaveBeenCalledWith({ sentryTrace: BODY_TRACE, baggage: 'sentry-trace_id=2222' });
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('gives up when the document finished parsing without a tag', async () => {
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    waitForTraceMetaTag(onTag, onGiveUp, 1000);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await vi.advanceTimersByTimeAsync(2000);

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onTag).not.toHaveBeenCalled();
  });

  it('still finds a tag from the last chunk when the document finished parsing', () => {
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    waitForTraceMetaTag(onTag, onGiveUp, 1000);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(onTag).toHaveBeenCalledWith({ sentryTrace: BODY_TRACE, baggage: undefined });
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('gives up after the timeout while the document is still streaming', async () => {
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    waitForTraceMetaTag(onTag, onGiveUp, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await vi.advanceTimersByTimeAsync(0);

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onTag).not.toHaveBeenCalled();
  });

  it('gives up early when asked, once', async () => {
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    const wait = waitForTraceMetaTag(onTag, onGiveUp, 1000);
    wait.giveUp();
    wait.giveUp();
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await vi.advanceTimersByTimeAsync(2000);

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onTag).not.toHaveBeenCalled();
  });

  it('gives up right away when the document already finished parsing', async () => {
    setReadyState('complete');
    const onTag = vi.fn();
    const onGiveUp = vi.fn();

    waitForTraceMetaTag(onTag, onGiveUp, 1000);

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onTag).not.toHaveBeenCalled();
  });
});

describe('addTraceMetaTagLink', () => {
  it('links the server request described by the sentry-trace value and carries the sampled flag', () => {
    const span = { addLink: vi.fn() } as unknown as Span;

    addTraceMetaTagLink(span, { sentryTrace: HEAD_TRACE, baggage: undefined });
    addTraceMetaTagLink(span, {
      sentryTrace: '33333333333333333333333333333333-3333333333333333-0',
      baggage: undefined,
    });

    expect(span.addLink).toHaveBeenNthCalledWith(1, {
      context: { traceId: '11111111111111111111111111111111', spanId: '1111111111111111', traceFlags: 1 },
      attributes: { [SENTRY_LINK_TYPE]: 'server_request' },
    });
    expect(span.addLink).toHaveBeenNthCalledWith(2, {
      context: { traceId: '33333333333333333333333333333333', spanId: '3333333333333333', traceFlags: 0 },
      attributes: { [SENTRY_LINK_TYPE]: 'server_request' },
    });
  });

  it('ignores values that are not a sentry-trace header', () => {
    const span = { addLink: vi.fn() } as unknown as Span;

    addTraceMetaTagLink(span, { sentryTrace: 'not-a-trace', baggage: undefined });

    expect(span.addLink).not.toHaveBeenCalled();
  });
});

describe('getServerRenderingType', () => {
  it('is static for a fully reused page', () => {
    expect(getServerRenderingType(undefined)).toBe('static');
  });

  it('is partially static when the pageload continues the trace of this request', () => {
    expect(getServerRenderingType({ sentryTrace: BODY_TRACE, baggage: undefined })).toBe('partially_static');
  });

  // A navigation or the wait cap can start the pageload before the resumed part arrives.
  it('is unset while a resumed part can still bring the trace of this request', () => {
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    expect(getServerRenderingType(undefined)).toBeUndefined();
  });

  it('is unset while a resumed part can still bring a tag after a Server-Timing header', () => {
    setReadyState('loading');
    setServerTimingTrace(BODY_TRACE);

    expect(getServerRenderingType(undefined)).toBeUndefined();
  });
});

describe('observeLateTraceMetaTag', () => {
  const SERVER_REQUEST_LINK = {
    context: { traceId: '22222222222222222222222222222222', spanId: '2222222222222222', traceFlags: 1 },
    attributes: { [SENTRY_LINK_TYPE]: 'server_request' },
  };

  type MockSpan = Span & { setAttribute: ReturnType<typeof vi.fn>; addLink: ReturnType<typeof vi.fn> };

  function createSpan(): MockSpan {
    return { isRecording: () => true, setAttribute: vi.fn(), addLink: vi.fn() } as unknown as MockSpan;
  }

  /** A client whose `spanEnd` listeners this test can fire and whose unsubscribe it can observe. */
  function createClient(): { client: Client; endSpan: (span: Span) => void; stopListening: ReturnType<typeof vi.fn> } {
    const listeners: Array<(span: Span) => void> = [];
    const stopListening = vi.fn();
    const client = {
      on: (_hook: string, callback: (span: Span) => void) => {
        listeners.push(callback);
        return stopListening;
      },
    } as unknown as Client;
    return { client, endSpan: span => listeners.forEach(listener => listener(span)), stopListening };
  }

  beforeEach(() => {
    setReadyState('loading');
  });

  it('marks a page as partially static when the tag arrives after a Server-Timing header connected the pageload', async () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    setServerTimingTrace(BODY_TRACE);
    const span = createSpan();

    const { client, stopListening } = createClient();

    observeLateTraceMetaTag(client, span);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    // MutationObserver callbacks run as microtasks.
    await Promise.resolve();

    expect(span.setAttribute).toHaveBeenCalledWith(PAGE_SERVER_RENDERING_TYPE, 'partially_static');
    expect(span.addLink).not.toHaveBeenCalled();
    expect(stopListening).toHaveBeenCalled();
  });

  it('leaves the type unset and stops watching when the pageload ends before the tag arrives', async () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    setServerTimingTrace(BODY_TRACE);
    const span = createSpan();
    const { client, endSpan, stopListening } = createClient();

    observeLateTraceMetaTag(client, span);
    span.isRecording = () => false;
    endSpan(span);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await Promise.resolve();

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.addLink).not.toHaveBeenCalled();
    expect(stopListening).toHaveBeenCalled();
  });

  it('marks a page as static when the document finishes without a tag', () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    setServerTimingTrace(BODY_TRACE);
    const span = createSpan();

    observeLateTraceMetaTag(createClient().client, span);
    setReadyState('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(span.setAttribute).toHaveBeenCalledWith(PAGE_SERVER_RENDERING_TYPE, 'static');
    expect(span.addLink).not.toHaveBeenCalled();
  });

  it('links the server request when nothing else connected the pageload', async () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const span = createSpan();

    observeLateTraceMetaTag(createClient().client, span);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await Promise.resolve();

    expect(span.addLink).toHaveBeenCalledWith(SERVER_REQUEST_LINK);
    expect(span.setAttribute).toHaveBeenCalledWith(PAGE_SERVER_RENDERING_TYPE, 'partially_static');
  });

  it('only links the server request for a document without a sentry-cache-origin tag', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const span = createSpan();

    observeLateTraceMetaTag(createClient().client, span);
    appendMeta(document.body, 'sentry-trace', BODY_TRACE);
    await Promise.resolve();
    setReadyState('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(span.addLink).toHaveBeenCalledWith(SERVER_REQUEST_LINK);
    expect(span.setAttribute).not.toHaveBeenCalled();
  });

  it('does nothing once the document finished parsing', () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    setReadyState('interactive');
    const span = createSpan();

    observeLateTraceMetaTag(createClient().client, span);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(span.setAttribute).not.toHaveBeenCalled();
    expect(span.addLink).not.toHaveBeenCalled();
  });
});
