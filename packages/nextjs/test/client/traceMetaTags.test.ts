// @vitest-environment jsdom
import { SENTRY_LINK_TYPE, SENTRY_OP } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import type { Span, StartSpanOptions } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTraceMetaTagLink,
  canWaitForTraceMetaTag,
  readTraceMetaTags,
  waitForTraceMetaTag,
  withCacheOrigin,
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

describe('withCacheOrigin', () => {
  const PAGELOAD_OPTIONS: StartSpanOptions = { name: '/products/:id', attributes: { [SENTRY_OP]: PAGELOAD } };
  const PRERENDER_LINK = {
    context: { traceId: '11111111111111111111111111111111', spanId: '1111111111111111', traceFlags: 1 },
    attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
  };

  it('returns the options unchanged for a document without a sentry-cache-origin tag', () => {
    appendMeta(document.head, 'sentry-trace', HEAD_TRACE);

    expect(withCacheOrigin(PAGELOAD_OPTIONS, { sentryTrace: HEAD_TRACE, baggage: undefined })).toBe(PAGELOAD_OPTIONS);
  });

  it('marks a fully reused page as static and links a sampled render as cache origin', () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);

    expect(withCacheOrigin(PAGELOAD_OPTIONS)).toEqual({
      name: '/products/:id',
      attributes: { [SENTRY_OP]: PAGELOAD, 'page.server_rendering.type': 'static' },
      links: [PRERENDER_LINK],
    });
  });

  it('marks a page as partially static when the pageload continues the trace of this request', () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);

    expect(withCacheOrigin(PAGELOAD_OPTIONS, { sentryTrace: BODY_TRACE, baggage: undefined })).toEqual({
      name: '/products/:id',
      attributes: { [SENTRY_OP]: PAGELOAD, 'page.server_rendering.type': 'partially_static' },
      links: [PRERENDER_LINK],
    });
  });

  // A navigation or the wait cap can start the pageload before the resumed part arrives.
  it('leaves the type unset while a resumed part can still bring the trace of this request', () => {
    appendMeta(document.head, 'sentry-cache-origin', HEAD_TRACE);
    setReadyState('loading');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    expect(withCacheOrigin(PAGELOAD_OPTIONS)).toEqual({
      name: '/products/:id',
      attributes: { [SENTRY_OP]: PAGELOAD },
      links: [PRERENDER_LINK],
    });
  });

  it.each([
    { tag: 'holds an unsampled trace', content: '11111111111111111111111111111111-1111111111111111-0' },
    { tag: 'holds a trace without a sampling decision', content: '11111111111111111111111111111111-1111111111111111' },
    { tag: 'holds no sentry-trace value', content: 'prerendered' },
  ])('marks the page without a link when the tag $tag', ({ content }) => {
    appendMeta(document.head, 'sentry-cache-origin', content);

    expect(withCacheOrigin(PAGELOAD_OPTIONS)).toEqual({
      name: '/products/:id',
      attributes: { [SENTRY_OP]: PAGELOAD, 'page.server_rendering.type': 'static' },
    });
  });
});
