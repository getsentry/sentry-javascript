/**
 * @vitest-environment jsdom
 */

import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE, SENTRY_OP } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import { beforeEach, describe, expect, it } from 'vitest';
import { setCurrentClient, startSpan } from '../../../src';
import type { StartSpanOptions } from '../../../src/types/startSpanOptions';
import {
  _INTERNAL_getCacheOriginMetaTag,
  _INTERNAL_getRootSpanSentryTrace,
  _INTERNAL_withCacheOrigin,
} from '../../../src/utils/cacheOrigin';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

const TRACE_ID = '0b37aaf4f0d74c0e80875099e7d7ca68';
const SPAN_ID = 'bc3a52360214dcf3';

const spanOptions: StartSpanOptions = { name: '/pricing', attributes: { [SENTRY_OP]: PAGELOAD } };

const cacheOriginLink = {
  context: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
  attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
};

function addCacheOriginTag(content: string): void {
  const tag = document.createElement('meta');
  tag.name = 'sentry-cache-origin';
  tag.content = content;
  document.head.appendChild(tag);
}

describe('_INTERNAL_getCacheOriginMetaTag', () => {
  it('holds the sentry-trace value of the render', () => {
    expect(_INTERNAL_getCacheOriginMetaTag(`${TRACE_ID}-${SPAN_ID}-1`)).toBe(
      `<meta name="sentry-cache-origin" content="${TRACE_ID}-${SPAN_ID}-1"/>`,
    );
  });

  it('is empty without a sentry-trace value', () => {
    expect(_INTERNAL_getCacheOriginMetaTag(undefined)).toBe('<meta name="sentry-cache-origin" content=""/>');
  });
});

describe('_INTERNAL_getRootSpanSentryTrace', () => {
  beforeEach(() => {
    resetGlobals();
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://123@sentry.io/42', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
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

// The server writes the tag and the client reads it, so the HTML format must stay readable by the client.
describe('the tag that _INTERNAL_getCacheOriginMetaTag writes', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('makes _INTERNAL_withCacheOrigin link the render', () => {
    document.head.innerHTML = _INTERNAL_getCacheOriginMetaTag(`${TRACE_ID}-${SPAN_ID}-1`);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
      links: [cacheOriginLink],
    });
  });

  it('makes _INTERNAL_withCacheOrigin set the rendering type without a link when it is empty', () => {
    document.head.innerHTML = _INTERNAL_getCacheOriginMetaTag(undefined);

    expect(_INTERNAL_withCacheOrigin(spanOptions, 'static')).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: PAGELOAD, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    });
  });
});
