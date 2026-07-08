import { describe, expect, it } from 'vitest';
import {
  getExtMetadata,
  getPluginName,
  getRouteMetadata,
  isDirectExtInput,
  isLifecycleExtType,
  isPatchableExtMethod,
} from '../../../src/integrations/tracing/hapi/vendored/utils';

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

describe('getPluginName', () => {
  it('reads the name property when present', () => {
    expect(getPluginName({ name: 'direct-name' } as any)).toBe('direct-name');
  });

  it('falls back to the package name', () => {
    expect(getPluginName({ pkg: { name: 'pkg-name' } } as any)).toBe('pkg-name');
  });
});

describe('ext type guards', () => {
  it('isLifecycleExtType recognizes lifecycle points', () => {
    expect(isLifecycleExtType('onPreHandler')).toBe(true);
    expect(isLifecycleExtType('onPreStart')).toBe(false);
    expect(isLifecycleExtType(undefined)).toBe(false);
  });

  it('isDirectExtInput recognizes the [type, method] tuple form', () => {
    expect(isDirectExtInput(['onPreHandler', () => {}])).toBe(true);
    expect(isDirectExtInput(['onPreHandler', 'not-a-fn'])).toBe(false);
    expect(isDirectExtInput({ type: 'onPreHandler' })).toBe(false);
  });

  it('isPatchableExtMethod is false for arrays', () => {
    expect(isPatchableExtMethod((() => {}) as any)).toBe(true);
    expect(isPatchableExtMethod([() => {}] as any)).toBe(false);
  });
});
