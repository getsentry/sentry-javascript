import { HTTP_REQUEST_METHOD, HTTP_ROUTE } from '@sentry/conventions/attributes';
import { setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import type { Span } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getExtMetadata, getRouteMetadata, wrapRouteArguments } from '../../src/integrations/hapi/hapi-utils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('getRouteMetadata', () => {
  const route = { path: '/users/{id}', method: 'get' } as any;

  afterEach(() => {
    setCurrentClient(undefined as unknown as TestClient);
  });

  it('describes a directly-registered route as a router layer', () => {
    expect(getRouteMetadata(route)).toEqual({
      name: 'GET /users/{id}',
      attributes: {
        'http.route': '/users/{id}',
        'http.request.method': 'get',
        'hapi.type': 'router',
      },
    });
  });

  it('describes a plugin-registered route as a plugin layer', () => {
    expect(getRouteMetadata(route, 'my-plugin')).toEqual({
      name: 'GET /users/{id}',
      attributes: {
        'http.route': '/users/{id}',
        'http.request.method': 'get',
        'hapi.type': 'plugin',
        'hapi.plugin.name': 'my-plugin',
      },
    });
  });

  it('drops the method from the router span name when span streaming is enabled', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    expect(getRouteMetadata(route).name).toBe('/users/{id}');
  });

  it('drops the method from the plugin span name when span streaming is enabled', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    expect(getRouteMetadata(route, 'my-plugin').name).toBe('/users/{id}');
  });

  it('falls back to a static span name when the route has no path', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    const pathlessRoute = { path: '', method: 'get' } as any;

    expect(getRouteMetadata(pathlessRoute).name).toBe('Router');
    expect(getRouteMetadata(pathlessRoute, 'my-plugin').name).toBe('Request handler');
  });

  it('uses one uppercase method when the route was registered with an array of methods', () => {
    expect(getRouteMetadata({ path: '/multi', method: ['GET', 'POST'] } as any, undefined, 'post')).toEqual({
      name: 'POST /multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        [HTTP_REQUEST_METHOD]: 'POST',
        'hapi.type': 'router',
      },
    });
  });

  it('uses one uppercase method for a plugin route registered with an array of methods', () => {
    expect(getRouteMetadata({ path: '/multi', method: ['GET', 'POST'] } as any, 'my-plugin', 'get')).toEqual({
      name: 'GET /multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        [HTTP_REQUEST_METHOD]: 'GET',
        'hapi.type': 'plugin',
        'hapi.plugin.name': 'my-plugin',
      },
    });
  });

  it('records one uppercase method and keeps the path span name when span streaming is enabled', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    expect(getRouteMetadata({ path: '/multi', method: ['GET', 'POST'] } as any, undefined, 'post')).toEqual({
      name: '/multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        [HTTP_REQUEST_METHOD]: 'POST',
        'hapi.type': 'router',
      },
    });
  });

  it('does not throw when an array method has no resolved request method', () => {
    expect(getRouteMetadata({ path: '/multi', method: ['GET', 'POST'] } as any)).toEqual({
      name: '/multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        'hapi.type': 'router',
      },
    });
  });

  it('keeps a string route method when a request method is also provided', () => {
    expect(getRouteMetadata({ path: '/single', method: 'GET' } as any, undefined, 'post')).toEqual({
      name: 'GET /single',
      attributes: {
        [HTTP_ROUTE]: '/single',
        [HTTP_REQUEST_METHOD]: 'GET',
        'hapi.type': 'router',
      },
    });
  });
});

describe('wrapRouteArguments', () => {
  afterEach(() => {
    setCurrentClient(undefined as unknown as TestClient);
  });

  function captureSpans(traceLifecycle?: 'stream'): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        ...(traceLifecycle ? { traceLifecycle } : {}),
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => {
      endedSpans.push(span);
    });
    return endedSpans;
  }

  function invokeWrapped(
    route: { method: string | string[]; path: string; handler: (request: unknown, h: unknown) => unknown },
    request: { method: string },
  ): unknown {
    wrapRouteArguments([route]);
    return startSpan({ name: 'incoming' }, () => route.handler(request, {}));
  }

  function routerSpan(endedSpans: Span[]) {
    return endedSpans.map(span => spanToJSON(span)).find(span => span.attributes['hapi.type'] === 'router');
  }

  it('reads the request method for a route registered with an array of methods', () => {
    const endedSpans = captureSpans();

    expect(
      invokeWrapped(
        {
          method: ['GET', 'POST'],
          path: '/multi',
          handler: () => 'ok',
        },
        { method: 'post' },
      ),
    ).toBe('ok');

    expect(routerSpan(endedSpans)).toMatchObject({
      name: 'POST /multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        [HTTP_REQUEST_METHOD]: 'POST',
        'hapi.type': 'router',
      },
    });
  });

  it('reads the request method and keeps the path span name when span streaming is enabled', () => {
    const endedSpans = captureSpans('stream');

    invokeWrapped(
      {
        method: ['GET', 'POST'],
        path: '/multi',
        handler: () => 'ok',
      },
      { method: 'get' },
    );

    expect(routerSpan(endedSpans)).toMatchObject({
      name: '/multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
        [HTTP_REQUEST_METHOD]: 'GET',
      },
    });
  });

  it('keeps the registered method for a string route', () => {
    const endedSpans = captureSpans();

    invokeWrapped(
      {
        method: 'GET',
        path: '/single',
        handler: () => 'ok',
      },
      { method: 'get' },
    );

    expect(routerSpan(endedSpans)).toMatchObject({
      name: 'GET /single',
      attributes: {
        [HTTP_REQUEST_METHOD]: 'GET',
      },
    });
  });

  it('still runs the route handler when building span metadata cannot resolve a method', () => {
    const endedSpans = captureSpans();

    expect(
      invokeWrapped(
        {
          method: ['GET', 'POST'],
          path: '/multi',
          handler: () => 'ok',
        },
        { method: '' },
      ),
    ).toBe('ok');

    expect(routerSpan(endedSpans)).toMatchObject({
      name: '/multi',
      attributes: {
        [HTTP_ROUTE]: '/multi',
      },
    });
    expect(routerSpan(endedSpans)?.attributes[HTTP_REQUEST_METHOD]).toBeUndefined();
  });

  it('propagates errors thrown by the route handler', () => {
    captureSpans();

    expect(() =>
      invokeWrapped(
        {
          method: ['GET', 'POST'],
          path: '/multi',
          handler: () => {
            throw new Error('user');
          },
        },
        { method: 'post' },
      ),
    ).toThrow('user');
  });
});

describe('getExtMetadata', () => {
  it('names an extension by its point', () => {
    expect(getExtMetadata('onPreHandler')).toEqual({
      name: 'ext - onPreHandler',
      attributes: { 'server.ext.type': 'onPreHandler', 'hapi.type': 'server.ext' },
    });
  });

  it('includes the method name when it is not the default `method`', () => {
    expect(getExtMetadata('onPreHandler', undefined, 'myHandler').name).toBe('ext - onPreHandler - myHandler');
    expect(getExtMetadata('onPreHandler', undefined, 'method').name).toBe('ext - onPreHandler');
  });

  it('includes the plugin name and prefixes the span name', () => {
    expect(getExtMetadata('onPreHandler', 'my-plugin')).toEqual({
      name: 'my-plugin: ext - onPreHandler',
      attributes: {
        'server.ext.type': 'onPreHandler',
        'hapi.type': 'server.ext',
        'hapi.plugin.name': 'my-plugin',
      },
    });
  });
});
