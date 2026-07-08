import { describe, expect, it } from 'vitest';
import { getExtMetadata, getRouteMetadata } from '../../../src/integrations/tracing-channel/hapi-utils';

describe('getRouteMetadata', () => {
  const route = { path: '/users/{id}', method: 'get' } as any;

  it('describes a directly-registered route as a router layer', () => {
    expect(getRouteMetadata(route)).toEqual({
      name: 'route - /users/{id}',
      attributes: {
        'http.route': '/users/{id}',
        'http.method': 'get',
        'hapi.type': 'router',
      },
    });
  });

  it('describes a plugin-registered route as a plugin layer', () => {
    expect(getRouteMetadata(route, 'my-plugin')).toEqual({
      name: 'my-plugin: route - /users/{id}',
      attributes: {
        'http.route': '/users/{id}',
        'http.method': 'get',
        'hapi.type': 'plugin',
        'hapi.plugin.name': 'my-plugin',
      },
    });
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
