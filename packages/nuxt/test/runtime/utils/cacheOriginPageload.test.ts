import { PAGE_SERVER_RENDERING_TYPE, SENTRY_LINK_TYPE, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { NAVIGATION, PAGELOAD } from '@sentry/conventions/op';
import type { StartSpanOptions } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { withCacheOrigin } from '../../../src/runtime/utils/cacheOriginPageload';

const TRACE_ID = '4c79f60c11214eb38604f4ae0781bfb2';
const SPAN_ID = 'fa90fdead5f74052';

const pageloadOptions: StartSpanOptions = {
  name: '/rendering-modes/swr-cached-page',
  op: PAGELOAD,
  attributes: { [SENTRY_OP]: PAGELOAD, [SENTRY_ORIGIN]: 'auto.pageload.vue' },
};

function addCacheOriginTag(content: string): void {
  const tag = document.createElement('meta');
  tag.name = 'sentry-cache-origin';
  tag.content = content;
  document.head.appendChild(tag);
}

describe('withCacheOrigin', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('marks the pageload as static and links the sampled render', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);

    const options = withCacheOrigin(pageloadOptions, true);

    expect(options).toEqual({
      ...pageloadOptions,
      attributes: { ...pageloadOptions.attributes, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
      links: [
        {
          context: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
          attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
        },
      ],
    });
  });

  it.each([
    { origin: 'an unsampled render', content: `${TRACE_ID}-${SPAN_ID}-0` },
    { origin: 'a render without a sampling decision', content: `${TRACE_ID}-${SPAN_ID}` },
    { origin: 'a build prerender', content: '' },
  ])('marks the pageload as static without a link for $origin', ({ content }) => {
    addCacheOriginTag(content);

    const options = withCacheOrigin(pageloadOptions, true);

    expect(options).toEqual({
      ...pageloadOptions,
      attributes: { ...pageloadOptions.attributes, [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    });
  });

  it('keeps the links that the pageload already has', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    const previousTraceLink = {
      context: { traceId: '0d5c7c7a6f0b4a57a3f1e9c2b8d4e6f1', spanId: 'b1a2c3d4e5f60718', traceFlags: 1 },
      attributes: { [SENTRY_LINK_TYPE]: 'previous_trace' },
    };

    const options = withCacheOrigin({ ...pageloadOptions, links: [previousTraceLink] }, true);

    expect(options.links).toEqual([
      previousTraceLink,
      {
        context: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
        attributes: { [SENTRY_LINK_TYPE]: 'cache_origin' },
      },
    ]);
  });

  it('does not change a pageload without a cache origin tag', () => {
    const options = withCacheOrigin(pageloadOptions, true);

    expect(options).toBe(pageloadOptions);
  });

  it('does not change the pageload of a client-side shell', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);

    const options = withCacheOrigin(pageloadOptions, false);

    expect(options).toBe(pageloadOptions);
  });

  it('does not change a navigation', () => {
    addCacheOriginTag(`${TRACE_ID}-${SPAN_ID}-1`);
    const navigationOptions: StartSpanOptions = { name: '/checkout', op: NAVIGATION };

    const options = withCacheOrigin(navigationOptions, true);

    expect(options).toBe(navigationOptions);
  });
});
