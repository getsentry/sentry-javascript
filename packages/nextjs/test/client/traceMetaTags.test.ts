// @vitest-environment jsdom
import type { Span } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTraceMetaTagLink,
  canWaitForTraceMetaTag,
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

const originalReadyState = Object.getOwnPropertyDescriptor(Document.prototype, 'readyState');

function setReadyState(value: DocumentReadyState): void {
  Object.defineProperty(document, 'readyState', { value, configurable: true });
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

afterEach(() => {
  // @ts-expect-error deleting the instance override restores the prototype getter
  delete document.readyState;
  if (originalReadyState) {
    Object.defineProperty(Document.prototype, 'readyState', originalReadyState);
  }
  vi.restoreAllMocks();
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
  it('links the span described by the sentry-trace value and carries the sampled flag', () => {
    const span = { addLink: vi.fn() } as unknown as Span;

    addTraceMetaTagLink(span, { sentryTrace: HEAD_TRACE, baggage: undefined });
    addTraceMetaTagLink(span, {
      sentryTrace: '33333333333333333333333333333333-3333333333333333-0',
      baggage: undefined,
    });

    expect(span.addLink).toHaveBeenNthCalledWith(1, {
      context: { traceId: '11111111111111111111111111111111', spanId: '1111111111111111', traceFlags: 1 },
    });
    expect(span.addLink).toHaveBeenNthCalledWith(2, {
      context: { traceId: '33333333333333333333333333333333', spanId: '3333333333333333', traceFlags: 0 },
    });
  });

  it('ignores values that are not a sentry-trace header', () => {
    const span = { addLink: vi.fn() } as unknown as Span;

    addTraceMetaTagLink(span, { sentryTrace: 'not-a-trace', baggage: undefined });

    expect(span.addLink).not.toHaveBeenCalled();
  });
});
