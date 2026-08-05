import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFetchArgs } from '../../../src/instrument/fetch';
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
  const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalWithFetch, 'fetch');

  // `maybeInstrument` patches the global `fetch` only once per module instance, so each test needs a
  // fresh copy of the instrumentation modules - otherwise only the first one actually wraps `fetch`.
  async function loadFetchModule() {
    vi.resetModules();
    return import('../../../src/instrument/fetch');
  }

  let addFetchInstrumentationHandler: Awaited<ReturnType<typeof loadFetchModule>>['addFetchInstrumentationHandler'];

  beforeEach(async () => {
    ({ addFetchInstrumentationHandler } = await loadFetchModule());
  });

  afterEach(() => {
    if (originalFetchDescriptor) {
      Object.defineProperty(globalWithFetch, 'fetch', originalFetchDescriptor);
    } else {
      Reflect.deleteProperty(globalWithFetch, 'fetch');
    }

    vi.restoreAllMocks();
  });

  it('enhances a fetch TypeError created in another realm', async () => {
    const error = runInNewContext(`new TypeError('Failed to fetch')`) as TypeError;
    expect(error).not.toBeInstanceOf(TypeError);

    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(error);
    addFetchInstrumentationHandler(() => undefined);

    await expect(globalThis.fetch('https://example.com/path')).rejects.toBe(error);

    expect(error.message).toBe('Failed to fetch (example.com)');
  });
});
