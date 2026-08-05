import { afterEach, describe, expect, it, vi } from 'vitest';
import { addFetchInstrumentationHandler, parseFetchArgs } from '../../../src/instrument/fetch';
import { resetInstrumentationHandlers } from '../../../src/instrument/handlers';
import * as isBrowserModule from '../../../src/utils/isBrowser';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

describe('instrument > parseFetchArgs', () => {
  it.each([
    ['string URL only', ['http://example.com'], { method: 'GET', url: 'http://example.com' }],
    ['URL object only', [new URL('http://example.com')], { method: 'GET', url: 'http://example.com/' }],
    ['Request URL only', [{ url: 'http://example.com' }], { method: 'GET', url: 'http://example.com' }],
    [
      'Request URL & method only',
      [{ url: 'http://example.com', method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
    ['string URL & options', ['http://example.com', { method: 'post' }], { method: 'POST', url: 'http://example.com' }],
    [
      'URL object & options',
      [new URL('http://example.com'), { method: 'post' }],
      { method: 'POST', url: 'http://example.com/' },
    ],
    [
      'Request URL & options',
      [{ url: 'http://example.com' }, { method: 'post' }],
      { method: 'POST', url: 'http://example.com' },
    ],
  ])('%s', (_name, args, expected) => {
    const actual = parseFetchArgs(args as unknown[]);

    expect(actual).toEqual(expected);
  });

  describe('fetch with Request object', () => {
    it.each([
      [
        'Request object (as only arg)',
        [new Request('http://example.com', { method: 'POST' })],
        { method: 'POST', url: 'http://example.com/' },
      ],
      [
        'Request object (with undefined options arg)',
        [new Request('http://example.com', { method: 'POST' }), undefined],
        { method: 'POST', url: 'http://example.com/' },
      ],
      [
        'Request object (with overwritten options arg)',
        [new Request('http://example.com', { method: 'POST' }), { method: 'DELETE' }],
        // fetch options overwrite Request object options
        { method: 'DELETE', url: 'http://example.com/' },
      ],
    ])('%s', (_name, args, expected) => {
      const actual = parseFetchArgs(args as unknown[]);

      expect(actual).toEqual(expected);
    });
  });
});

describe('instrument > addFetchInstrumentationHandler', () => {
  const globalWithFetch = GLOBAL_OBJ as typeof GLOBAL_OBJ & { fetch?: (...args: unknown[]) => unknown };

  afterEach(() => {
    resetInstrumentationHandlers();
    vi.restoreAllMocks();
  });

  it('preserves non-standard own properties on the global fetch (e.g. Bun `fetch.preconnect`)', () => {
    // Non-browser runtime so we skip the native-fetch check and always patch
    vi.spyOn(isBrowserModule, 'isBrowser').mockReturnValue(false);

    const preconnect = vi.fn();
    const originalFetch = vi.fn(() => Promise.resolve(new Response()));
    (originalFetch as unknown as { preconnect: unknown }).preconnect = preconnect;
    globalWithFetch.fetch = originalFetch as unknown as typeof globalWithFetch.fetch;

    try {
      addFetchInstrumentationHandler(() => {});

      // fetch was actually wrapped ...
      expect(globalWithFetch.fetch).not.toBe(originalFetch);
      // ... and the non-standard own property was carried over onto the wrapper
      expect((globalWithFetch.fetch as unknown as { preconnect: unknown }).preconnect).toBe(preconnect);
    } finally {
      globalWithFetch.fetch = originalFetch as unknown as typeof globalWithFetch.fetch;
    }
  });
});
