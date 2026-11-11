/**
 * @vitest-environment jsdom
 */

import { PAGE_SERVER_RENDERING_TYPE, SENTRY_OP } from '@sentry/conventions/attributes';
import { beforeEach, describe, expect, it } from 'vitest';
import { withCacheOrigin } from '../../src/client/traceMetaTags';

const spanOptions = { name: '/pricing', attributes: { [SENTRY_OP]: 'pageload' } };

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

  it('returns the span options unchanged for a page without a cache origin tag', () => {
    expect(withCacheOrigin(spanOptions)).toBe(spanOptions);
  });

  it('marks the pageload as static and links a sampled render', () => {
    addCacheOriginTag('0b37aaf4f0d74c0e80875099e7d7ca68-bc3a52360214dcf3-1');

    expect(withCacheOrigin(spanOptions)).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: 'pageload', [PAGE_SERVER_RENDERING_TYPE]: 'static' },
      links: [
        {
          context: { traceId: '0b37aaf4f0d74c0e80875099e7d7ca68', spanId: 'bc3a52360214dcf3', traceFlags: 1 },
          attributes: { 'sentry.link.type': 'cache_origin' },
        },
      ],
    });
  });

  it.each([
    { kind: 'an empty tag (prerendered during the build)', content: '' },
    { kind: 'an unsampled render', content: '0b37aaf4f0d74c0e80875099e7d7ca68-bc3a52360214dcf3-0' },
    { kind: 'a render without a sampling decision', content: '0b37aaf4f0d74c0e80875099e7d7ca68-bc3a52360214dcf3' },
    { kind: 'a malformed value', content: 'not-a-trace' },
  ])('marks the pageload as static without a link for $kind', ({ content }) => {
    addCacheOriginTag(content);

    expect(withCacheOrigin(spanOptions)).toEqual({
      name: '/pricing',
      attributes: { [SENTRY_OP]: 'pageload', [PAGE_SERVER_RENDERING_TYPE]: 'static' },
    });
  });
});
