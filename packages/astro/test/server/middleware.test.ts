import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { Client, Span } from '@sentry/types';
import { vi } from 'vitest';

import { handleRequest, interpolateRouteFromUrlAndParams } from '../../src/server/middleware';

vi.mock('../../src/server/meta', () => ({
  getTracingMetaTags: () => ({
    sentryTrace: '<meta name="sentry-trace" content="123">',
    baggage: '<meta name="baggage" content="abc">',
  }),
}));

describe('sentryMiddleware', () => {
  const startSpanSpy = vi.spyOn(SentryNode, 'startSpan');

  const getSpanMock = vi.fn(() => {
    return {} as Span | undefined;
  });
  const setUserMock = vi.fn();
  const setSDKProcessingMetadataMock = vi.fn();

  beforeEach(() => {
    vi.spyOn(SentryNode, 'getCurrentScope').mockImplementation(() => {
      return {
        setUser: setUserMock,
        setPropagationContext: vi.fn(),
        getSpan: getSpanMock,
        setSDKProcessingMetadata: setSDKProcessingMetadataMock,
      } as any;
    });
    vi.spyOn(SentryNode, 'getActiveSpan').mockImplementation(getSpanMock);
    vi.spyOn(SentryNode, 'getClient').mockImplementation(() => ({}) as Client);
  });

  const nextResult = Promise.resolve(new Response(null, { status: 200, headers: new Headers() }));

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a span for an incoming request', async () => {
    const middleware = handleRequest();
    const ctx = {
      request: {
        method: 'GET',
        url: '/users/123/details',
        headers: new Headers(),
      },
      url: new URL('https://myDomain.io/users/123/details'),
      params: {
        id: '123',
      },
    };
    const next = vi.fn(() => nextResult);

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = middleware(ctx, next);

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        attributes: {
          'sentry.origin': 'auto.http.astro',
          method: 'GET',
          url: 'https://mydomain.io/users/123/details',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        },
        name: 'GET /users/[id]/details',
        op: 'http.server',
      },
      expect.any(Function), // the `next` function
    );

    expect(next).toHaveBeenCalled();
    expect(resultFromNext).toStrictEqual(nextResult);
  });

  it("sets source route if the url couldn't be decoded correctly", async () => {
    const middleware = handleRequest();
    const ctx = {
      request: {
        method: 'GET',
        url: '/a%xx',
        headers: new Headers(),
      },
      url: { pathname: 'a%xx', href: 'http://localhost:1234/a%xx' },
      params: {},
    };
    const next = vi.fn(() => nextResult);

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = middleware(ctx, next);

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        attributes: {
          'sentry.origin': 'auto.http.astro',
          method: 'GET',
          url: 'http://localhost:1234/a%xx',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
        name: 'GET a%xx',
        op: 'http.server',
      },
      expect.any(Function), // the `next` function
    );

    expect(next).toHaveBeenCalled();
    expect(resultFromNext).toStrictEqual(nextResult);
  });

  it('throws and sends an error to sentry if `next()` throws', async () => {
    const captureExceptionSpy = vi.spyOn(SentryNode, 'captureException');

    const middleware = handleRequest();
    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers(),
      },
      url: new URL('https://myDomain.io/users/'),
      params: {},
    };

    const error = new Error('Something went wrong');

    const next = vi.fn(() => {
      throw error;
    });

    // @ts-expect-error, a partial ctx object is fine here
    await expect(async () => middleware(ctx, next)).rejects.toThrowError();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'astro', data: { function: 'astroMiddleware' } },
    });
  });

  it('attaches client IP if `trackClientIp=true`', async () => {
    const middleware = handleRequest({ trackClientIp: true });
    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers({
          'some-header': 'some-value',
        }),
      },
      clientAddress: '192.168.0.1',
      params: {},
      url: new URL('https://myDomain.io/users/'),
    };
    const next = vi.fn(() => nextResult);

    // @ts-expect-error, a partial ctx object is fine here
    await middleware(ctx, next);

    expect(setUserMock).toHaveBeenCalledWith({ ip_address: '192.168.0.1' });
  });

  it('attaches request as SDK processing metadata', async () => {
    const middleware = handleRequest({});
    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers({
          'some-header': 'some-value',
        }),
      },
      clientAddress: '192.168.0.1',
      params: {},
      url: new URL('https://myDomain.io/users/'),
    };
    const next = vi.fn(() => nextResult);

    // @ts-expect-error, a partial ctx object is fine here
    await middleware(ctx, next);

    expect(setSDKProcessingMetadataMock).toHaveBeenCalledWith({
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers({
          'some-header': 'some-value',
        }),
      },
    });
  });

  it('injects tracing <meta> tags into the HTML of a pageload response', async () => {
    const middleware = handleRequest();

    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers(),
      },
      params: {},
      url: new URL('https://myDomain.io/users/'),
    };
    const next = vi.fn(() =>
      Promise.resolve(
        new Response('<head><meta name="something" content=""/></head>', {
          headers: new Headers({ 'content-type': 'text/html' }),
        }),
      ),
    );

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = await middleware(ctx, next);

    expect(resultFromNext?.headers.get('content-type')).toEqual('text/html');

    const html = await resultFromNext?.text();

    expect(html).toContain('<meta name="sentry-trace" content="');
    expect(html).toContain('<meta name="baggage" content="');
  });

  it("no-ops if the response isn't HTML", async () => {
    const middleware = handleRequest();

    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers(),
      },
      params: {},
      url: new URL('https://myDomain.io/users/'),
    };

    const originalResponse = new Response('{"foo": "bar"}', {
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    const next = vi.fn(() => Promise.resolve(originalResponse));

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = await middleware(ctx, next);

    expect(resultFromNext).toBe(originalResponse);
  });

  it("no-ops if there's no <head> tag in the response", async () => {
    const middleware = handleRequest();

    const ctx = {
      request: {
        method: 'GET',
        url: '/users',
        headers: new Headers(),
      },
      params: {},
      url: new URL('https://myDomain.io/users/'),
    };

    const originalHtml = '<p>no head</p>';
    const originalResponse = new Response(originalHtml, {
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    const next = vi.fn(() => Promise.resolve(originalResponse));

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = await middleware(ctx, next);

    expect(resultFromNext?.headers.get('content-type')).toEqual('text/html');

    const html = await resultFromNext?.text();

    expect(html).toBe(originalHtml);
  });

  describe('async context isolation', () => {
    const withIsolationScopeSpy = vi.spyOn(SentryNode, 'withIsolationScope');
    afterEach(() => {
      vi.clearAllMocks();
      withIsolationScopeSpy.mockRestore();
    });

    it('starts a new async context if no span is active', async () => {
      getSpanMock.mockReturnValueOnce(undefined);
      const handler = handleRequest();
      const ctx = {};
      const next = vi.fn();

      try {
        // @ts-expect-error, a partial ctx object is fine here
        await handler(ctx, next);
      } catch {
        // this is fine, it's not required to pass in this test
      }

      expect(withIsolationScopeSpy).toHaveBeenCalledTimes(1);
    });

    it("doesn't start a new async context if a span is active", async () => {
      // @ts-expect-error, a empty span is fine here
      getSpanMock.mockReturnValueOnce({});

      const handler = handleRequest();
      const ctx = {};
      const next = vi.fn();

      try {
        // @ts-expect-error, a partial ctx object is fine here
        await handler(ctx, next);
      } catch {
        // this is fine, it's not required to pass in this test
      }

      expect(withIsolationScopeSpy).not.toHaveBeenCalled();
    });
  });
});

describe('interpolateRouteFromUrlAndParams', () => {
  it.each([
    ['/', {}, '/'],
    ['/foo/bar', {}, '/foo/bar'],
    ['/users/123', { id: '123' }, '/users/[id]'],
    ['/users/123', { id: '123', foo: 'bar' }, '/users/[id]'],
    ['/lang/en-US', { lang: 'en', region: 'US' }, '/lang/[lang]-[region]'],
    ['/lang/en-US/posts', { lang: 'en', region: 'US' }, '/lang/[lang]-[region]/posts'],
    // edge cases that astro doesn't support
    ['/lang/-US', { region: 'US' }, '/lang/-[region]'],
    ['/lang/en-', { lang: 'en' }, '/lang/[lang]-'],
  ])('interpolates route from URL and params %s', (rawUrl, params, expectedRoute) => {
    expect(interpolateRouteFromUrlAndParams(rawUrl, params)).toEqual(expectedRoute);
  });

  it.each([
    ['/(a+)+/aaaaaaaaa!', { id: '(a+)+', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
    ['/([a-zA-Z]+)*/aaaaaaaaa!', { id: '([a-zA-Z]+)*', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
    ['/(a|aa)+/aaaaaaaaa!', { id: '(a|aa)+', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
    ['/(a|a?)+/aaaaaaaaa!', { id: '(a|a?)+', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
    // with URL encoding
    ['/(a%7Caa)+/aaaaaaaaa!', { id: '(a|aa)+', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
    ['/(a%7Ca?)+/aaaaaaaaa!', { id: '(a|a?)+', slug: 'aaaaaaaaa!' }, '/[id]/[slug]'],
  ])('handles regex characters in param values correctly %s', (rawUrl, params, expectedRoute) => {
    expect(interpolateRouteFromUrlAndParams(rawUrl, params)).toEqual(expectedRoute);
  });

  it('handles params across multiple URL segments in catchall routes', () => {
    // Ideally, Astro would let us know that this is a catchall route so we can make the param [...catchall] but it doesn't
    expect(
      interpolateRouteFromUrlAndParams('/someroute/catchall-123/params/foo/bar', {
        catchall: 'catchall-123/params/foo',
        params: 'foo',
      }),
    ).toEqual('/someroute/[catchall]/bar');
  });

  it("doesn't replace partially matching route segments", () => {
    const rawUrl = '/usernames/username';
    const params = { name: 'username' };
    const expectedRoute = '/usernames/[name]';
    expect(interpolateRouteFromUrlAndParams(rawUrl, params)).toEqual(expectedRoute);
  });

  it('handles set but undefined params', () => {
    const rawUrl = '/usernames/user';
    const params = { name: undefined, name2: '' };
    const expectedRoute = '/usernames/user';
    expect(interpolateRouteFromUrlAndParams(rawUrl, params)).toEqual(expectedRoute);
  });
});
