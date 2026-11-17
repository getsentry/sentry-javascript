/**
 * @vitest-environment jsdom
 */

import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE, SENTRY_OP } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import { beforeEach, describe, expect, it } from 'vitest';
import { setCurrentClient, startSpan } from '../../../src';
import type { StartSpanOptions } from '../../../src/types/startSpanOptions';
import {
  _INTERNAL_getCacheOriginMetaTags,
  _INTERNAL_getRenderStart,
  _INTERNAL_getRootSpanSentryTrace,
  _INTERNAL_withCacheOrigin,
} from '../../../src/utils/cacheOrigin';
import { browserPerformanceTimeOrigin } from '../../../src/utils/time';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

const TRACE_ID = '0b37aaf4f0d74c0e80875099e7d7ca68';
const SPAN_ID = 'bc3a52360214dcf3';

const PAGE_SERVER_RENDERING_AGE = 'page.server_rendering.age';

const RENDER_START = 1_700_000_000;
const REQUEST_START = RENDER_START - 100;

const spanOptions: StartSpanOptions = { name: '/pricing', attributes: { [SENTRY_OP]: PAGELOAD } };

const cacheOriginLink = {
  context: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
  attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
};

function addMetaTag(name: string, content: string): void {
  const tag = document.createElement('meta');
  tag.name = name;
  tag.content = content;
  document.head.appendChild(tag);
}

function addCacheOriginTag(content: string): void {
  addMetaTag('sentry-cache-origin', content);
}

function initTestClient(tracesSampleRate: number): void {
  resetGlobals();
  const client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://123@sentry.io/42', tracesSampleRate }));
  setCurrentClient(client);
  client.init();
}

describe('_INTERNAL_getCacheOriginMetaTags', () => {
  beforeEach(() => {
    initTestClient(1);
  });

  it('holds the sentry-trace value and the start of the root span while a child span is active', () => {
    startSpan({ name: 'GET /pricing', startTime: RENDER_START + 0.9 }, () =>
      startSpan({ name: 'sveltekit.resolve', startTime: RENDER_START + 5 }, () => {
        expect(_INTERNAL_getCacheOriginMetaTags(`${TRACE_ID}-${SPAN_ID}-1`, REQUEST_START)).toBe(
          `<meta name="sentry-cache-origin" content="${TRACE_ID}-${SPAN_ID}-1"/>\n` +
            `<meta name="sentry-render-start" content="${RENDER_START}"/>`,
        );
      }),
    );
  });

  it('has an empty cache origin tag and the request start without a span (prerendered during the build)', () => {
    expect(_INTERNAL_getCacheOriginMetaTags(undefined, REQUEST_START + 0.9)).toBe(
      `<meta name="sentry-cache-origin" content=""/>\n<meta name="sentry-render-start" content="${REQUEST_START}"/>`,
    );
  });
});

describe('_INTERNAL_getRootSpanSentryTrace', () => {
  beforeEach(() => {
    initTestClient(1);
  });

  it('returns the sentry-trace of the root span while a child span is active', () => {
    startSpan({ name: 'GET /pricing' }, rootSpan =>
      startSpan({ name: 'sveltekit.resolve' }, () => {
        const { traceId, spanId } = rootSpan.spanContext();
        expect(_INTERNAL_getRootSpanSentryTrace()).toBe(`${traceId}-${spanId}-1`);
      }),
    );
  });
});

describe('_INTERNAL_getRenderStart', () => {
  it('returns the start of a recording span in whole seconds', () => {
    initTestClient(1);

    startSpan({ name: 'prerender route (app) /pricing', startTime: RENDER_START + 0.9 }, span => {
      expect(_INTERNAL_getRenderStart(span, REQUEST_START)).toBe(RENDER_START);
    });
  });

  it('returns the start without a span for a span that does not record', () => {
    initTestClient(0);

    startSpan({ name: 'prerender route (app) /pricing', startTime: RENDER_START }, span => {
      expect(_INTERNAL_getRenderStart(span, REQUEST_START + 0.9)).toBe(REQUEST_START);
    });
  });

  it('returns the start without a span when there is no span', () => {
    expect(_INTERNAL_getRenderStart(undefined, REQUEST_START)).toBe(REQUEST_START);
  });
});

describe('_INTERNAL_withCacheOrigin', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('returns the span options unchanged for a page without a cache origin tag', () => {
    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toBe(spanOptions);
  });

  // HTML requires `content` on a named meta tag, so the SDK cannot have written this one.
  it('returns the span options unchanged for a cache origin tag without `content`', () => {
    const tag = document.createElement('meta');
    tag.name = 'sentry-cache-origin';
    document.head.appendChild(tag);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toBe(spanOptions);
  });

  it('sets the rendering type and links a sampled render', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'partially_static')).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'partially_static' },
      links: [cacheOriginLink],
    });
  });

  it.each([
    { kind: 'an empty tag (prerendered during the build)', content: '' },
    { kind: 'an unsampled render', content: `${TRACE_ID}-${SPAN_ID}-0` },
    { kind: 'a render without a sampling decision', content: `${TRACE_ID}-${SPAN_ID}` },
    { kind: 'a malformed value', content: 'not-a-trace' },
  ])('sets the rendering type without a link for $kind', ({ content }) => {
    addCacheOriginTag(content);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    });
  });

  it('links the render but leaves the rendering type unset without one', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);

    expect(_INTERNAL_withCacheOrigin(spanOptions, undefined)).toEqual({ ...spanOptions, links: [cacheOriginLink] });
  });

  it('keeps the links that the span options already have', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    const previousTraceLink = {
      context: { traceId: '0d5c7c7a6f0b4a57a3f1e9c2b8d4e6f1', spanId: 'b1a2c3d4e5f60718', traceFlags: 1 },
      attributes: { [SENTRY_LINK_TYPE]: 'previous_trace' },
    };

    expect(_INTERNAL_withCacheOrigin({ ...spanOptions, links: [previousTraceLink] }, 'static').links).toEqual([
      previousTraceLink,
      cacheOriginLink,
    ]);
  });
});

describe('_INTERNAL_withCacheOrigin with a sentry-render-start tag', () => {
  const pageloadStart = Math.floor(browserPerformanceTimeOrigin()! / 1000);
  const ONE_YEAR = 365 * 24 * 60 * 60;

  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('sets the age of the render at the time origin in whole seconds', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    addMetaTag('sentry-render-start', String(pageloadStart - 3_600));

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static').attributes).toEqual({
      [SENTRY_OP]: PAGELOAD,
      [PAGE_SERVER_RENDERING_TYPE]: 'static',
      [PAGE_SERVER_RENDERING_AGE]: 3_600,
    });
  });

  // The server clock can be ahead of the browser clock.
  it('sets the age to 0 for a render that seems to start after the pageload', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    addMetaTag('sentry-render-start', String(pageloadStart + 5_000));

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static').attributes?.[PAGE_SERVER_RENDERING_AGE]).toBe(0);
  });

  it('sets an age of one year', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    addMetaTag('sentry-render-start', String(pageloadStart - ONE_YEAR));

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static').attributes?.[PAGE_SERVER_RENDERING_AGE]).toBe(ONE_YEAR);
  });

  it('sets no age without a cache origin tag', () => {
    addMetaTag('sentry-render-start', String(pageloadStart));

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toBe(spanOptions);
  });

  it.each([
    { kind: 'an empty value', content: '' },
    { kind: 'a fraction', content: `${pageloadStart}.5` },
    { kind: 'a negative value', content: '-1' },
    { kind: 'an exponent', content: '1.7e9' },
    { kind: 'a date', content: '2026-11-13T14:00:00Z' },
    { kind: 'a render more than one year ago', content: String(pageloadStart - ONE_YEAR - 1) },
    { kind: 'a server clock at 1970', content: '0' },
  ])('sets no age for $kind', ({ content }) => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    addMetaTag('sentry-render-start', content);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static').attributes).toEqual({
      [SENTRY_OP]: PAGELOAD,
      [PAGE_SERVER_RENDERING_TYPE]: 'static',
    });
  });
});

// The server writes the tags and the client reads them, so the HTML format must stay readable by the client.
describe('the tags that _INTERNAL_getCacheOriginMetaTags writes', () => {
  const pageloadStart = Math.floor(browserPerformanceTimeOrigin()! / 1000);

  beforeEach(() => {
    document.head.innerHTML = '';
  });

  function writeTags(renderTrace: string | undefined): void {
    document.head.innerHTML = _INTERNAL_getCacheOriginMetaTags(renderTrace, pageloadStart - 42);
  }

  it('make _INTERNAL_withCacheOrigin link the render and set its age', () => {
    writeTags(`${TRACE_ID}-${SPAN_ID}-1`);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toEqual({
      ...spanOptions,
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'static', [PAGE_SERVER_RENDERING_AGE]: 42 },
      links: [cacheOriginLink],
    });
  });

  it('make _INTERNAL_withCacheOrigin set the rendering type and age without a link when the cache origin is empty', () => {
    writeTags(undefined);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toEqual({
      ...spanOptions,
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'static', [PAGE_SERVER_RENDERING_AGE]: 42 },
    });
  });
});
