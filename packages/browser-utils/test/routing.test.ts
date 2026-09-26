import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCachedRouteProvider,
  createUrlRouteProvider,
  resolveCurrentRoute,
  getRouteProvider,
  resolveRoute,
  setRouteProvider,
} from '../src/routing';
import type { RouteProvider } from '../src/routing';
import { debug, getCurrentScope, GLOBAL_OBJ, setCurrentClient } from '@sentry/core';
import { getDefaultClientOptions, TestClient } from './utils/TestClient';

function setLocationHref(href: string): void {
  (GLOBAL_OBJ as { document?: unknown }).document = { location: { href } };
}

function makeClient(): TestClient {
  const client = new TestClient(getDefaultClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }));
  setCurrentClient(client);
  client.init();

  return client;
}

describe('routing', () => {
  let client: TestClient;

  beforeEach(() => {
    client = makeClient();
    setLocationHref('https://example.com/users/42?q=1#frag');
  });

  afterEach(() => {
    delete (GLOBAL_OBJ as { document?: unknown }).document;
    vi.restoreAllMocks();
  });

  describe('without a registered provider', () => {
    it('returns undefined rather than falling back to the raw path', () => {
      expect(resolveRoute('https://example.com/users/42')).toBeUndefined();
      expect(resolveCurrentRoute()).toBeUndefined();
      expect(getRouteProvider()).toBeUndefined();
    });
  });

  describe('resolveRoute', () => {
    it('hands the provider a parsed URL so it never has to parse itself', () => {
      const resolveSpy = vi.fn().mockReturnValue('/users/:id');
      setRouteProvider({ resolveRoute: resolveSpy, resolveCurrentRoute: () => undefined });

      expect(resolveRoute('https://example.com/users/42?q=1')).toBe('/users/:id');
      expect(resolveSpy).toHaveBeenCalledWith(new URL('https://example.com/users/42?q=1'));
    });

    it('accepts a URL object as-is', () => {
      const url = new URL('https://example.com/users/42');
      const resolveSpy = vi.fn().mockReturnValue('/users/:id');
      setRouteProvider({ resolveRoute: resolveSpy, resolveCurrentRoute: () => undefined });

      expect(resolveRoute(url)).toBe('/users/:id');
      expect(resolveSpy).toHaveBeenCalledWith(url);
    });

    it('resolves a relative location against the document, which memory routers rely on', () => {
      const resolveSpy = vi.fn().mockReturnValue('/users/:id');
      setRouteProvider({ resolveRoute: resolveSpy, resolveCurrentRoute: () => undefined });

      resolveRoute('7');

      expect(resolveSpy).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/users/7', search: '', hash: '' }));
    });

    it('resolves a URL the router has already navigated away from', () => {
      setRouteProvider({
        resolveRoute: url => (url.pathname.startsWith('/posts/') ? '/posts/:slug' : undefined),
        resolveCurrentRoute: () => '/users/:id',
      });

      expect(resolveRoute('https://example.com/posts/hello')).toBe('/posts/:slug');
      expect(resolveCurrentRoute()).toBe('/users/:id');
    });

    it('returns undefined for an unparseable URL without calling the provider', () => {
      const resolveSpy = vi.fn();
      setRouteProvider({ resolveRoute: resolveSpy, resolveCurrentRoute: () => undefined });

      expect(resolveRoute('http://')).toBeUndefined();
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('normalizes an empty route name to undefined', () => {
      setRouteProvider({ resolveRoute: () => '', resolveCurrentRoute: () => '' });

      expect(resolveRoute('https://example.com/users/42')).toBeUndefined();
      expect(resolveCurrentRoute()).toBeUndefined();
    });
  });

  describe('provider errors', () => {
    it('swallows a throwing provider instead of taking down the caller', () => {
      setRouteProvider({
        resolveRoute: () => {
          throw new Error('router blew up');
        },
        resolveCurrentRoute: () => {
          throw new Error('router blew up');
        },
      });

      expect(resolveRoute('https://example.com/users/42')).toBeUndefined();
      expect(resolveCurrentRoute()).toBeUndefined();
    });
  });

  describe('routeProvider option', () => {
    function makeClientWithProvider(provider: RouteProvider): TestClient {
      const optionClient = new TestClient({ ...getDefaultClientOptions(), routeProvider: provider } as ReturnType<
        typeof getDefaultClientOptions
      >);
      setCurrentClient(optionClient);
      optionClient.init();

      return optionClient;
    }

    it('resolves through the provider passed as an option', () => {
      const optionClient = makeClientWithProvider({
        resolveRoute: () => '/users/:id',
        resolveCurrentRoute: () => '/users/:id',
      });

      expect(getRouteProvider(optionClient)).toBeDefined();
      expect(resolveCurrentRoute(optionClient)).toBe('/users/:id');
    });

    it('is replaced by a provider registered at runtime', () => {
      vi.spyOn(debug, 'warn').mockImplementation(() => {});
      const optionClient = makeClientWithProvider({
        resolveRoute: () => '/option',
        resolveCurrentRoute: () => '/option',
      });

      setRouteProvider({ resolveRoute: () => '/runtime', resolveCurrentRoute: () => '/runtime' }, optionClient);

      expect(resolveCurrentRoute(optionClient)).toBe('/runtime');
    });
  });

  describe('setRouteProvider', () => {
    it('scopes the provider to its client', () => {
      const otherClient = new TestClient(getDefaultClientOptions());
      setRouteProvider({ resolveRoute: () => '/users/:id', resolveCurrentRoute: () => '/users/:id' }, client);

      expect(resolveCurrentRoute(client)).toBe('/users/:id');
      expect(resolveCurrentRoute(otherClient)).toBeUndefined();
    });

    it('replaces a previously registered provider and warns', () => {
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
      setRouteProvider({ resolveRoute: () => '/first', resolveCurrentRoute: () => '/first' });
      setRouteProvider({ resolveRoute: () => '/second', resolveCurrentRoute: () => '/second' });

      expect(resolveCurrentRoute()).toBe('/second');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not warn when registering the first provider', () => {
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
      setRouteProvider({ resolveRoute: () => '/first', resolveCurrentRoute: () => '/first' });

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns per client rather than globally', () => {
      const otherClient = makeClient();
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => {});
      const provider = { resolveRoute: () => '/users/:id', resolveCurrentRoute: () => '/users/:id' };

      setRouteProvider(provider, client);
      setRouteProvider(provider, otherClient);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no current client', () => {
      getCurrentScope().setClient(undefined);
      const provider: RouteProvider = { resolveRoute: () => '/users/:id', resolveCurrentRoute: () => '/users/:id' };

      expect(() => setRouteProvider(provider)).not.toThrow();
      expect(getRouteProvider()).toBeUndefined();
      expect(resolveCurrentRoute()).toBeUndefined();
    });
  });

  describe('createCachedRouteProvider', () => {
    it('resolves a path the router has reported', () => {
      const provider = createCachedRouteProvider();
      provider.record('/users/42', '/users/:id');
      setRouteProvider(provider);

      expect(resolveRoute('https://example.com/users/42')).toBe('/users/:id');
      expect(resolveCurrentRoute()).toBe('/users/:id');
    });

    it('returns undefined for a path the router has not reported yet', () => {
      const provider = createCachedRouteProvider();
      setRouteProvider(provider);

      expect(resolveRoute('https://example.com/users/42')).toBeUndefined();
    });

    it('keeps other routes when re-recording one into a full cache', () => {
      const provider = createCachedRouteProvider(2);
      provider.record('/users/42', '/users/:id');
      provider.record('/posts/hello', '/posts/:slug');

      provider.record('/posts/hello', '/posts/:slug');

      expect(provider.resolveRoute(new URL('https://example.com/posts/hello'))).toBe('/posts/:slug');
      expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
    });

    it('keeps resolving a URL the router has navigated away from', () => {
      const provider = createCachedRouteProvider();
      provider.record('/posts/hello', '/posts/:slug');
      provider.record('/users/42', '/users/:id');
      setRouteProvider(provider);

      expect(resolveRoute('https://example.com/posts/hello')).toBe('/posts/:slug');
    });

    it('ignores empty paths and route names', () => {
      const provider = createCachedRouteProvider();
      provider.record(undefined, '/users/:id');
      provider.record('/users/42', null);
      setRouteProvider(provider);

      expect(resolveRoute('https://example.com/users/42')).toBeUndefined();
    });

    it('evicts the oldest entry once the cache is full', () => {
      const provider = createCachedRouteProvider(2);
      provider.record('/a', '/a');
      provider.record('/b', '/b');
      provider.record('/c', '/c');
      setRouteProvider(provider);

      expect(resolveRoute('https://example.com/a')).toBeUndefined();
      expect(resolveRoute('https://example.com/b')).toBe('/b');
      expect(resolveRoute('https://example.com/c')).toBe('/c');
    });

    it('keeps a recently resolved path alive past newer entries', () => {
      const provider = createCachedRouteProvider(2);
      provider.record('/a', '/a');
      provider.record('/b', '/b');
      setRouteProvider(provider);

      // Resolving `/a` makes it the most recently used, so `/b` is evicted instead.
      expect(resolveRoute('https://example.com/a')).toBe('/a');
      provider.record('/c', '/c');

      expect(resolveRoute('https://example.com/a')).toBe('/a');
      expect(resolveRoute('https://example.com/b')).toBeUndefined();
    });
  });

  describe('createUrlRouteProvider', () => {
    it('derives the current route from the document location', () => {
      setRouteProvider(createUrlRouteProvider(url => (url.pathname === '/users/42' ? '/users/:id' : undefined)));

      expect(resolveCurrentRoute()).toBe('/users/:id');
    });

    it('returns undefined when the current location matches no route', () => {
      setRouteProvider(createUrlRouteProvider(() => undefined));

      expect(resolveCurrentRoute()).toBeUndefined();
    });

    it('returns undefined when there is no document location to read', () => {
      delete (GLOBAL_OBJ as { document?: unknown }).document;
      setRouteProvider(createUrlRouteProvider(() => '/users/:id'));

      expect(resolveCurrentRoute()).toBeUndefined();
    });
  });
});
