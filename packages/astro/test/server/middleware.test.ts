import type { Client, Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, interpolateRouteFromUrlAndParams } from '../../src/server/middleware';

const DYNAMIC_REQUEST_CONTEXT = {
  clientAddress: '192.168.0.1',
  request: {
    method: 'GET',
    url: '/users',
    headers: new Headers(),
  },
  params: {},
  url: new URL('https://myDomain.io/users/'),
};

const STATIC_REQUEST_CONTEXT = {
  request: {
    method: 'GET',
    url: '/users',
    headers: new Headers({
      'some-header': 'some-value',
    }),
  },
  get clientAddress() {
    throw new Error('clientAddress.get() should not be called in static page requests');
  },
  params: {},
  url: new URL('https://myDomain.io/users/'),
};

describe('sentryMiddleware', () => {
  const startSpanSpy = vi.spyOn(SentryNode, 'startSpan');

  const getSpanMock = vi.fn(() => {
    return {
      spanContext: () => ({
        spanId: '123',
        traceId: '123',
      }),
    } as Span | undefined;
  });
  const setSDKProcessingMetadataMock = vi.fn();

  beforeEach(() => {
    vi.spyOn(SentryNode, 'getCurrentScope').mockImplementation(() => {
      return {
        setPropagationContext: vi.fn(),
        getSpan: getSpanMock,
        setSDKProcessingMetadata: setSDKProcessingMetadataMock,
        getPropagationContext: () => ({}),
      } as any;
    });
    vi.spyOn(SentryNode, 'getActiveSpan').mockImplementation(getSpanMock);
    vi.spyOn(SentryNode, 'getClient').mockImplementation(() => ({ getOptions: () => ({}) }) as Client);
    vi.spyOn(SentryNode, 'getTraceMetaTags').mockImplementation(
      () => `
    <meta name="sentry-trace" content="123">
    <meta name="baggage" content="abc">
    `,
    );
    vi.spyOn(SentryCore, 'getDynamicSamplingContextFromSpan').mockImplementation(() => ({
      transaction: 'test',
    }));

    // Ensure this is wiped
    SentryCore.setUser(null);
  });

  const nextResult = Promise.resolve(new Response(null, { status: 200, headers: new Headers() }));

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a span for an incoming request', async () => {
    const middleware = handleRequest();
    const ctx = {
      ...DYNAMIC_REQUEST_CONTEXT,
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
          [SentryCore.SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: 'GET',
          'http.route': '/users/[id]/details',
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
      ...DYNAMIC_REQUEST_CONTEXT,
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
          [SentryCore.SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: 'GET',
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
      ...DYNAMIC_REQUEST_CONTEXT,
    };

    const error = new Error('Something went wrong');

    const next = vi.fn(() => {
      throw error;
    });

    // @ts-expect-error, a partial ctx object is fine here
    await expect(async () => middleware(ctx, next)).rejects.toThrowError();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.middleware.astro' },
    });
  });

  it('throws and sends an error to sentry if response streaming throws', async () => {
    const captureExceptionSpy = vi.spyOn(SentryNode, 'captureException');

    const middleware = handleRequest();
    const ctx = {
      ...DYNAMIC_REQUEST_CONTEXT,
    };

    const error = new Error('Something went wrong');

    const faultyStream = new ReadableStream({
      pull: controller => {
        controller.error(error);
        controller.close();
      },
    });

    const next = vi.fn(() =>
      Promise.resolve(
        new Response(faultyStream, {
          headers: new Headers({ 'content-type': 'text/html' }),
        }),
      ),
    );

    // @ts-expect-error, a partial ctx object is fine here
    const resultFromNext = await middleware(ctx, next);

    expect(resultFromNext).toBeDefined();
    expect(resultFromNext?.headers.get('content-type')).toEqual('text/html');
    await expect(() => resultFromNext?.text()).rejects.toThrowError();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.middleware.astro' },
    });
  });

  describe('track client IP address', () => {
    it('attaches client IP if `trackClientIp=true` when handling dynamic page requests', async () => {
      const middleware = handleRequest({ trackClientIp: true });
      const ctx = {
        ...DYNAMIC_REQUEST_CONTEXT,
      };

      // @ts-expect-error, a partial ctx object is fine here
      await middleware(ctx, async () => {
        expect(SentryCore.getIsolationScope().getScopeData().user).toEqual({ ip_address: '192.168.0.1' });
        return nextResult;
      });
    });

    it("doesn't attach a client IP if `trackClientIp=true` when handling static page requests", async () => {
      const middleware = handleRequest({ trackClientIp: true });

      const ctx = STATIC_REQUEST_CONTEXT;

      // @ts-expect-error, a partial ctx object is fine here
      await middleware(ctx, async () => {
        expect(SentryCore.getIsolationScope().getScopeData().user).toEqual({
          email: undefined,
          id: undefined,
          ip_address: undefined,
          username: undefined,
        });
        return nextResult;
      });
    });
  });

  describe('request data', () => {
    it('attaches request as SDK processing metadata in dynamic page requests', async () => {
      const middleware = handleRequest({});
      const ctx = {
        ...DYNAMIC_REQUEST_CONTEXT,
        request: {
          method: 'GET',
          url: '/users',
          headers: new Headers({
            'some-header': 'some-value',
          }),
        },
      };
      const next = vi.fn(() => nextResult);

      // @ts-expect-error, a partial ctx object is fine here
      await middleware(ctx, next);

      expect(setSDKProcessingMetadataMock).toHaveBeenCalledWith({
        normalizedRequest: {
          method: 'GET',
          url: '/users',
          headers: {
            'some-header': 'some-value',
          },
        },
      });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("doesn't attach request headers as processing metadata for static page requests", async () => {
      const middleware = handleRequest({});
      const ctx = STATIC_REQUEST_CONTEXT;
      const next = vi.fn(() => nextResult);

      // @ts-expect-error, a partial ctx object is fine here
      await middleware(ctx, next);

      expect(setSDKProcessingMetadataMock).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  it('does not inject tracing <meta> tags if route is static', async () => {
    const middleware = handleRequest();

    const ctx = STATIC_REQUEST_CONTEXT;
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

    expect(html).toContain('<head>');
    expect(html).toContain('<meta name="something" content=""/></head>');
    // parametrized route is injected
    expect(html).toContain('<meta name="sentry-route-name" content="%2Fusers"/>');
    // trace data is not injected
    expect(html).not.toContain('<meta name="sentry-trace" content="');
    expect(html).not.toContain('<meta name="baggage" content="');
  });

  it('injects routing <meta> tag into the HTML of a pageload response without Sentry being initialized', async () => {
    vi.spyOn(SentryNode, 'getClient').mockImplementation(() => undefined);

    const middleware = handleRequest();

    const ctx = {
      ...DYNAMIC_REQUEST_CONTEXT,
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

    expect(html).toContain('<head>');
    expect(html).toContain('<meta name="something" content=""/></head>');
    expect(html).not.toContain('<meta name="sentry-route-name" content="%2Fusers"/>');
    expect(html).not.toContain('<meta name="sentry-trace" content="');
    expect(html).not.toContain('<meta name="baggage" content="');
  });

  it('injects tracing <meta> tags into the HTML of a pageload response when Sentry is initialized', async () => {
    const middleware = handleRequest();

    const ctx = {
      ...DYNAMIC_REQUEST_CONTEXT,
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

    expect(html).toContain('<head>');
    expect(html).toContain('<meta name="something" content=""/></head>');
    expect(html).toContain('<meta name="sentry-route-name" content="%2Fusers"/>');
    expect(html).toContain('<meta name="sentry-trace" content="');
    expect(html).toContain('<meta name="baggage" content="');
  });

  it("no-ops if the response isn't HTML", async () => {
    const middleware = handleRequest();

    const ctx = {
      ...DYNAMIC_REQUEST_CONTEXT,
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
      ...DYNAMIC_REQUEST_CONTEXT,
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
      const ctx = {
        ...DYNAMIC_REQUEST_CONTEXT,
      };
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
      getSpanMock.mockReturnValueOnce({
        spanContext: () => ({
          spanId: '123',
          traceId: '123',
          traceFlags: 1,
        }),
        // @ts-expect-error, this is fine
        getSpanJSON: () => ({
          span_id: '123',
          trace_id: '123',
          op: 'http.server',
        }),
      });

      const handler = handleRequest();
      const ctx = {
        ...DYNAMIC_REQUEST_CONTEXT,
      };
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

  it('removes trailing slashes from the route', () => {
    const rawUrl = '/users/123/';
    const params = { id: '123' };
    const expectedRoute = '/users/[id]';
    expect(interpolateRouteFromUrlAndParams(rawUrl, params)).toEqual(expectedRoute);
  });
});
