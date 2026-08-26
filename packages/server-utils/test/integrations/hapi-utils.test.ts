import { setCurrentClient } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { getExtMetadata, getRouteMetadata } from '../../src/integrations/hapi/hapi-utils';
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

  it('keeps the plugin span name when span streaming is enabled', () => {
    const client = new TestClient(getDefaultTestClientOptions({ traceLifecycle: 'stream' }));
    setCurrentClient(client);

    expect(getRouteMetadata(route, 'my-plugin').name).toBe('GET /users/{id}');
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
