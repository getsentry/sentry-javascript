import {
  HAPI_EXT_TYPE,
  HAPI_PLUGIN_NAME,
  HAPI_TYPE,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_EXT_TYPE,
} from '@sentry/conventions/attributes';
import { ROUTER } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import { setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getExtMetadata, getRouteMetadata, wrapRouteArguments } from '../../src/integrations/hapi/hapi-utils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('getRouteMetadata', () => {
  const route = { path: '/users/{id}', method: 'GET' };

  afterEach(() => {
    setCurrentClient(undefined as unknown as TestClient);
  });

  it('describes a directly-registered route as a router layer', () => {
    expect(getRouteMetadata(route)).toEqual({
      name: 'GET /users/{id}',
      attributes: {
        [HTTP_ROUTE]: '/users/{id}',
        [HTTP_REQUEST_METHOD]: 'GET',
        [HAPI_TYPE]: 'router',
      },
    });
  });

  it('describes a plugin-registered route as a plugin layer', () => {
    expect(getRouteMetadata({ ...route, pluginName: 'my-plugin' })).toEqual({
      name: 'GET /users/{id}',
      attributes: {
        [HTTP_ROUTE]: '/users/{id}',
        [HTTP_REQUEST_METHOD]: 'GET',
        [HAPI_TYPE]: 'plugin',
        [HAPI_PLUGIN_NAME]: 'my-plugin',
      },
    });
  });

  it('names the span after the path alone when the request method is unknown', () => {
    expect(getRouteMetadata({ path: '/users/{id}' })).toEqual({
      name: '/users/{id}',
      attributes: {
        [HTTP_ROUTE]: '/users/{id}',
        [HAPI_TYPE]: 'router',
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

    expect(getRouteMetadata({ ...route, pluginName: 'my-plugin' }).name).toBe('/users/{id}');
  });

  it('falls back to a static span name when the route has no path', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    expect(getRouteMetadata({ path: '', method: 'GET' }).name).toBe('Router');
    expect(getRouteMetadata({ path: '', method: 'GET', pluginName: 'my-plugin' }).name).toBe('Request handler');
  });
});

describe('wrapRouteArguments', () => {
  afterEach(() => {
    setCurrentClient(undefined as unknown as TestClient);
  });

  it.each([
    { request: { method: 'post' }, name: 'POST /multi', method: 'POST' },
    { request: {}, name: '/multi', method: undefined },
  ])('names the router span $name for a multi-method route', ({ request, name, method }) => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    const route = {
      method: ['GET', 'POST'],
      path: '/multi',
      handler: (_request: unknown, _h: unknown): unknown => 'ok',
    };
    wrapRouteArguments([route]);

    const response = startSpan({ name: 'incoming' }, () => route.handler(request, {}));

    expect(response).toBe('ok');
    const routerSpan = endedSpans.map(span => spanToJSON(span)).find(span => span.attributes[SENTRY_OP] === ROUTER);
    expect(routerSpan?.name).toBe(name);
    expect(routerSpan?.attributes).toEqual({
      [HTTP_ROUTE]: '/multi',
      [HTTP_REQUEST_METHOD]: method,
      [HAPI_TYPE]: 'router',
      [SENTRY_OP]: ROUTER,
      [SENTRY_ORIGIN]: 'auto.http.hapi',
    });
  });
});

describe('getExtMetadata', () => {
  it('names an extension by its point', () => {
    expect(getExtMetadata('onPreHandler')).toEqual({
      name: 'ext - onPreHandler',
      attributes: {
        [HAPI_EXT_TYPE]: 'onPreHandler',
        // oxlint-disable-next-line typescript/no-deprecated
        [SERVER_EXT_TYPE]: 'onPreHandler',
        [HAPI_TYPE]: 'server.ext',
      },
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
        [HAPI_EXT_TYPE]: 'onPreHandler',
        // oxlint-disable-next-line typescript/no-deprecated
        [SERVER_EXT_TYPE]: 'onPreHandler',
        [HAPI_TYPE]: 'server.ext',
        [HAPI_PLUGIN_NAME]: 'my-plugin',
      },
    });
  });
});
