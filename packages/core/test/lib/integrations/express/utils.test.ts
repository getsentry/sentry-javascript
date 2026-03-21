import { storeLayer } from '../../../../src/integrations/express/request-layer-store';
import {
  ATTR_EXPRESS_NAME,
  ATTR_EXPRESS_TYPE,
  type MiddlewareError,
  type ExpressIntegrationOptions,
  type ExpressLayer,
  type ExpressRequest,
  type ExpressRequestInfo,
} from '../../../../src/integrations/express/types';
import {
  asErrorAndMessage,
  defaultShouldHandleError,
  getActualMatchedRoute,
  getConstructedRoute,
  getLayerMetadata,
  getLayerPath,
  getRouterPath,
  getSpanName,
  hasDefaultProp,
  isExpressWithoutRouterPrototype,
  isExpressWithRouterPrototype,
  isLayerIgnored,
  isRoutePattern,
  satisfiesPattern,
} from '../../../../src/integrations/express/utils';

import { describe, it, expect, vi } from 'vitest';

describe('asErrorAndMessage', () => {
  it('returns an Error with its message', () => {
    const er = new Error('message');
    expect(asErrorAndMessage(er)).toStrictEqual([er, 'message']);
  });
  it('returns an non-Error cast to string', () => {
    const er = {
      toString() {
        return 'message';
      },
    };
    expect(asErrorAndMessage(er)).toStrictEqual(['message', 'message']);
  });
});

describe('isRoutePattern', () => {
  it('searches for : and *', () => {
    expect(isRoutePattern('a:b')).toBe(true);
    expect(isRoutePattern('abc*')).toBe(true);
    expect(isRoutePattern('abc')).toBe(false);
  });
});

describe('satisfiesPattern', () => {
  it('matches a string', () => {
    expect(satisfiesPattern('a', 'a')).toBe(true);
    expect(satisfiesPattern('a', 'b')).toBe(false);
  });
  it('matches a regexp', () => {
    expect(satisfiesPattern('a', /a/)).toBe(true);
    expect(satisfiesPattern('a', /b/)).toBe(false);
  });
  it('calls a function', () => {
    const m = (s: string) => s === 'a';
    expect(satisfiesPattern('a', m)).toBe(true);
    expect(satisfiesPattern('b', m)).toBe(false);
  });
  it('throws otherwise', () => {
    expect(() => {
      //@ts-expect-error test verifies type prevents this mistake
      satisfiesPattern('a', {});
    }).toThrowError('Pattern is unsupported datatype');
  });
});

describe('getRouterPath', () => {
  it('reconstructs returns path if layer is empty', () => {
    expect(getRouterPath('/a', {} as unknown as ExpressLayer)).toBe('/a');
    expect(
      getRouterPath('/a', {
        handle: {},
      } as unknown as ExpressLayer),
    ).toBe('/a');
    expect(
      getRouterPath('/a', {
        handle: { stack: [] },
      } as unknown as ExpressLayer),
    ).toBe('/a');
    expect(
      getRouterPath('/a', {
        handle: {
          stack: [
            {
              handle: {
                stack: [
                  {
                    handle: {
                      stack: [],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as ExpressLayer),
    ).toBe('/a');
  });

  it('uses the stackLayer route path if present', () => {
    expect(
      getRouterPath('/a', {
        handle: {
          stack: [{ route: { path: '/b' } }],
        },
      } as unknown as ExpressLayer),
    ).toBe('/a/b');
  });

  it('recurses to search layer stack', () => {
    expect(
      getRouterPath('/a', {
        handle: {
          stack: [
            {
              handle: {
                stack: [
                  {
                    handle: {
                      stack: [{ route: { path: '/b' } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      } as unknown as ExpressLayer),
    ).toBe('/a/b');
  });
});

describe('getLayerMetadata', () => {
  it('returns the metadata from router layer', () => {
    expect(
      getLayerMetadata('/a', {
        name: 'router',
        route: { path: '/b' },
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/a',
        [ATTR_EXPRESS_TYPE]: 'router',
      },
      name: 'router - /a',
    });
    expect(
      getLayerMetadata(
        '/a',
        {
          name: 'router',
          route: {},
        } as unknown as ExpressLayer,
        '/c',
      ),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/c',
        [ATTR_EXPRESS_TYPE]: 'router',
      },
      name: 'router - /c',
    });
    expect(
      getLayerMetadata('/a', {
        name: 'router',
        route: {},
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/a',
        [ATTR_EXPRESS_TYPE]: 'router',
      },
      name: 'router - /a',
    });
    expect(
      getLayerMetadata('', {
        name: 'router',
        route: {},
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/',
        [ATTR_EXPRESS_TYPE]: 'router',
      },
      name: 'router - /',
    });
    expect(
      getLayerMetadata('', {
        name: 'router',
        handle: {
          stack: [{ route: { path: '/b' } }],
        },
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/b',
        [ATTR_EXPRESS_TYPE]: 'router',
      },
      name: 'router - /b',
    });
    expect(
      getLayerMetadata('', {
        name: 'bound dispatch',
        handle: {
          stack: [{ route: { path: '/b' } }],
        },
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: 'request handler',
        [ATTR_EXPRESS_TYPE]: 'request_handler',
      },
      name: 'request handler',
    });
    expect(
      getLayerMetadata('/r', {
        name: 'handle',
        path: '/l',
        handle: {
          stack: [{ route: { path: '/b' } }],
        },
      } as unknown as ExpressLayer),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/r',
        [ATTR_EXPRESS_TYPE]: 'request_handler',
      },
      name: 'request handler - /r',
    });
    expect(
      getLayerMetadata(
        '',
        {
          name: 'handle',
          path: '/l',
          handle: {
            stack: [{ route: { path: '/b' } }],
          },
        } as unknown as ExpressLayer,
        '/x',
      ),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: '/x',
        [ATTR_EXPRESS_TYPE]: 'request_handler',
      },
      name: 'request handler - /x',
    });
    expect(
      getLayerMetadata(
        '',
        {
          name: 'some_other_thing',
          path: '/l',
          handle: {
            stack: [{ route: { path: '/b' } }],
          },
        } as unknown as ExpressLayer,
        '/x',
      ),
    ).toStrictEqual({
      attributes: {
        [ATTR_EXPRESS_NAME]: 'some_other_thing',
        [ATTR_EXPRESS_TYPE]: 'middleware',
      },
      name: 'middleware - some_other_thing',
    });
  });
});

describe('isLayerIgnored', () => {
  it('ignores layers that include the ignored type', () => {
    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayersType: ['router'],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(true);

    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayers: [/^x$/],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(true);

    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayers: ['x'],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(true);
    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayers: [() => true],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(true);

    expect(isLayerIgnored('x', 'router', {} as unknown as ExpressIntegrationOptions)).toBe(false);
    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayersType: ['middleware'],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(false);
    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayers: [() => false],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(false);
    expect(
      isLayerIgnored('x', 'router', {
        ignoreLayers: [
          () => {
            throw new Error('x');
          },
        ],
      } as unknown as ExpressIntegrationOptions),
    ).toBe(false);
  });
});

describe('getActualMatchedRoute', () => {
  it('handles empty layersStore', () => {
    const req = {} as unknown as ExpressRequest;
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe(undefined);
  });

  it('handles case when all stored layers are /', () => {
    const req = { originalUrl: '/' } as unknown as ExpressRequest;
    storeLayer(req, '/');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe('/');
    req.originalUrl = '/other-thing';
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe(undefined);
  });

  it('returns constructed route if *', () => {
    const req = { originalUrl: '/xyz' } as unknown as ExpressRequest;
    storeLayer(req, '*');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe('*');
  });

  it('returns constructed route when it looks regexp-ish', () => {
    const req = { originalUrl: '/xyz' } as unknown as ExpressRequest;
    storeLayer(req, '/\\,[*]/');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe('/\\,[*]/');
  });

  it('ensures constructed route starts with /', () => {
    const req = { originalUrl: '/a/b' } as unknown as ExpressRequest;
    storeLayer(req, 'a');
    storeLayer(req, '/b');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe('/a/b');
  });

  it('allows routes that contain *', () => {
    const req = { originalUrl: '/a/b' } as unknown as ExpressRequest;
    storeLayer(req, 'a');
    storeLayer(req, '/:boo');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe('/a/:boo');
  });

  it('returns undefined if invalid', () => {
    const req = { originalUrl: '/a/b' } as unknown as ExpressRequest;
    storeLayer(req, '/a');
    storeLayer(req, '/c');
    expect(getActualMatchedRoute(req, getConstructedRoute(req))).toBe(undefined);
  });
});

describe('getConstructedRoute', () => {
  it('returns * when the only meaningful path', () => {
    const req = {} as unknown as ExpressRequest;
    storeLayer(req, '*');
    // not-meaningful paths
    storeLayer(req, '/');
    storeLayer(req, '/*');
    expect(getConstructedRoute(req)).toBe('*');
  });

  it('joins meaningful paths together', () => {
    const req = {} as unknown as ExpressRequest;
    storeLayer(req, '/a');
    storeLayer(req, '/b/');
    storeLayer(req, '/*');
    storeLayer(req, '/c');
    expect(getConstructedRoute(req)).toBe('/a/b/c');
  });
});

describe('hasDefaultProp', () => {
  it('returns detects the presence of a default function prop', () => {
    expect(hasDefaultProp({ default: function express() {} })).toBe(true);
    expect(hasDefaultProp({ default: 'other thing' })).toBe(false);
    expect(hasDefaultProp({})).toBe(false);
  });
});

describe('isExpressWith(out)RouterPrototype', () => {
  it('detects what kind of express this is', () => {
    expect(isExpressWithoutRouterPrototype({})).toBe(false);
    expect(
      isExpressWithoutRouterPrototype(
        Object.assign(function express() {}, {
          Router: Object.assign(function Router() {}, {
            route() {},
          }),
        }),
      ),
    ).toBe(true);
    expect(
      isExpressWithoutRouterPrototype(
        Object.assign(function express() {}, {
          Router: class Router {
            route() {}
          },
        }),
      ),
    ).toBe(false);
    expect(isExpressWithRouterPrototype({})).toBe(false);
    expect(
      isExpressWithRouterPrototype({
        Router: Object.assign(function Router() {}, {
          route() {},
        }),
      }),
    ).toBe(false);
    expect(
      isExpressWithRouterPrototype({
        Router: class Router {
          route() {}
        },
      }),
    ).toBe(true);
  });
});

describe('getLayerPath', () => {
  it('extracts the layer path segment from first arg', () => {
    expect(getLayerPath(['/x'])).toBe('/x');
    expect(getLayerPath([['/x', '/y']])).toBe('/x,/y');
    expect(getLayerPath([['/x', null, 1, /z/i, '/y']])).toBe('/x,,1,/z/i,/y');
  });
});

describe('defaultShouldHandleError', () => {
  it('returns true if the response status code is 500', () => {
    // just a wrapper to not have to type this out each time.
    const _ = (o: unknown): MiddlewareError => o as MiddlewareError;
    expect(defaultShouldHandleError(_({ status: 500 }))).toBe(true);
    expect(defaultShouldHandleError(_({ statusCode: 500 }))).toBe(true);
    expect(defaultShouldHandleError(_({ status_code: 500 }))).toBe(true);
    expect(defaultShouldHandleError(_({ output: { statusCode: 500 } }))).toBe(true);
    expect(defaultShouldHandleError(_({}))).toBe(true);
    expect(defaultShouldHandleError(_({ status: 200 }))).toBe(false);
    expect(defaultShouldHandleError(_({ statusCode: 200 }))).toBe(false);
    expect(defaultShouldHandleError(_({ status_code: 200 }))).toBe(false);
    expect(defaultShouldHandleError(_({ output: { statusCode: 200 } }))).toBe(false);
  });
});

let transactionName = '';
const notDefaultIsolationScope = {
  setTransactionName(name: string) {
    transactionName = name;
  },
};
let isolationScope = notDefaultIsolationScope;
const defaultIsolationScope = {
  setTransactionName(_: string) {
    throw new Error('should not set tx name in default isolation scope');
  },
};
vi.mock('../../../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));
const debugWarnings: string[] = [];
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: {
    warn: (msg: string) => {
      debugWarnings.push(msg);
    },
  },
}));
vi.mock('../../../../src/currentScopes', () => ({
  getIsolationScope() {
    return isolationScope;
  },
}));
vi.mock('../../../../src/defaultScopes', () => ({
  getDefaultIsolationScope() {
    return defaultIsolationScope;
  },
}));
describe('getSpanName', () => {
  it('no setting tx name when in default isolation scope', () => {
    isolationScope = defaultIsolationScope;
    expect(getSpanName({} as unknown as ExpressRequestInfo<unknown>, 'default')).toBe('default');
    expect(debugWarnings).toStrictEqual([
      'Isolation scope is still default isolation scope - skipping setting transactionName',
    ]);
    expect(transactionName).toBe('');
    debugWarnings.length = 0;
  });

  it('no setting tx name when not a request_handler', () => {
    isolationScope = notDefaultIsolationScope;
    expect(getSpanName({} as unknown as ExpressRequestInfo<unknown>, 'default')).toBe('default');
    expect(debugWarnings).toStrictEqual([]);
    expect(transactionName).toBe('');
    debugWarnings.length = 0;
  });

  it('sets tx name for request_handler in isolation scope', () => {
    isolationScope = notDefaultIsolationScope;
    expect(
      getSpanName(
        {
          layerType: 'request_handler',
          request: {
            method: 'put',
          },
          route: '/a/:boo',
        } as unknown as ExpressRequestInfo<unknown>,
        'default',
      ),
    ).toBe('default');
    expect(debugWarnings).toStrictEqual([]);
    expect(transactionName).toBe('PUT /a/:boo');
    debugWarnings.length = 0;
  });

  it('method defaults to GET', () => {
    isolationScope = notDefaultIsolationScope;
    expect(
      getSpanName(
        {
          layerType: 'request_handler',
          request: {},
          route: '/a/:boo',
        } as unknown as ExpressRequestInfo<unknown>,
        'default',
      ),
    ).toBe('default');
    expect(debugWarnings).toStrictEqual([]);
    expect(transactionName).toBe('GET /a/:boo');
    debugWarnings.length = 0;
  });
});
