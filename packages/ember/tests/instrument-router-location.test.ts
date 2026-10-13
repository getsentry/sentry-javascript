import { describe, expect, it } from 'vitest';
import { _getLocationURL, _recognizeURL } from '../src/utils/instrumentEmberAppInstanceForPerformance.ts';

interface Location {
  formatURL?: (url: string) => string;
  getURL?: () => string;
  implementation?: string;
  rootURL: string;
}

describe('_getLocationURL', () => {
  it('handles hash location without implementation field', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('/#/test-route');
  });

  it('handles hash location with implementation field', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      implementation: 'hash',
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('/#/test-route');
  });

  it('handles history location', () => {
    const mockLocation: Location = {
      getURL: () => '/test-route',
      formatURL: (url: string) => url,
      implementation: 'history',
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('/test-route');
  });

  it('handles none location type', () => {
    const mockLocation: Location = {
      getURL: () => '',
      formatURL: (url: string) => url,
      implementation: 'none',
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('');
  });

  it('handles custom rootURL for hash location', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/my-app/',
    };

    expect(_getLocationURL(mockLocation)).toBe('/my-app/#/test-route');
  });

  it('handles location without getURL method', () => {
    const mockLocation: Location = {
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('');
  });

  it('handles location without formatURL method', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      rootURL: '/',
    };

    expect(_getLocationURL(mockLocation)).toBe('');
  });
});

type RouterServiceArg = Parameters<typeof _recognizeURL>[0];

function mockRouterService(recognize: (url: string) => unknown): RouterServiceArg {
  return { recognize } as unknown as RouterServiceArg;
}

describe('_recognizeURL', () => {
  it('returns the route info when the router recognizes the URL', () => {
    const routeInfo = { name: 'my.route', params: { id: '1' } };
    const routerService = mockRouterService(() => routeInfo);

    expect(_recognizeURL(routerService, '/my/route/1')).toBe(routeInfo);
  });

  it('returns undefined when the URL is not prefixed with the rootURL', () => {
    // Ember's `none` location (used by `@ember/test-helpers`) yields URLs that `recognize()`
    // rejects with this assertion, which previously threw out of the integration's setup.
    const routerService = mockRouterService(() => {
      throw new Error('Assertion Failed: You must pass a url that begins with the application\'s rootURL "/"');
    });

    expect(_recognizeURL(routerService, 'not-root-url-prefixed')).toBeUndefined();
  });

  it('returns undefined for any other recognize() failure', () => {
    const routerService = mockRouterService(() => {
      throw new Error('nope');
    });

    expect(_recognizeURL(routerService, '/unknown')).toBeUndefined();
  });
});
