/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { init } from '../../src/client/index';

describe('instruments fetch', () => {
  beforeEach(() => {
    // For the happy path, we can assume that both fetch and the fetch proxy are set
    // We test the edge cases in the other tests below

    // @ts-expect-error this fine just for the test
    globalThis.fetch = () => Promise.resolve('fetch');

    globalThis._sentryFetchProxy = () => Promise.resolve('_sentryFetchProxy');
    // small hack to make `supportsNativeFetch` return true
    globalThis._sentryFetchProxy.toString = () => 'function fetch() { [native code] }';
  });

  it('correctly swaps and instruments window._sentryFetchProxy', async () => {
    // We expect init to swap window.fetch with our fetch proxy so that the proxy is instrumented
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
    });

    // fetch proxy was instrumented
    expect(globalThis._sentryFetchProxy['__sentry_original__']).toBeDefined();

    // in the end, fetch and fetch proxy were restored correctly
    expect(await globalThis.fetch('')).toEqual('fetch');
    expect(await globalThis._sentryFetchProxy()).toEqual('_sentryFetchProxy');
  });

  it("doesn't swap fetch if the fetch proxy doesn't exist", async () => {
    delete globalThis._sentryFetchProxy;

    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
    });

    expect(await globalThis.fetch('')).toEqual('fetch');
    expect(globalThis._sentryFetchProxy).toBeUndefined();
  });

  it("doesn't swap fetch if global fetch doesn't exist", async () => {
    // @ts-expect-error this fine just for the test
    delete globalThis.fetch;

    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
    });

    expect(await globalThis._sentryFetchProxy()).toEqual('_sentryFetchProxy');
    expect(globalThis._sentryFetchProxy['__sentry_original__']).toBeUndefined();
  });
});
