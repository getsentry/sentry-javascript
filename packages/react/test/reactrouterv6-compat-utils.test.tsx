import { describe, expect, it, test } from 'vitest';
import { checkRouteForAsyncHandler } from '../src/lazy-route-utils';
import { getNumberOfUrlSegments } from '../src/reactrouterv6-compat-utils';
import type { RouteObject } from '../src/types';

// Mock processResolvedRoutes function for tests
const mockProcessResolvedRoutes = () => {};

describe('getNumberOfUrlSegments', () => {
  test.each([
    ['regular path', '/projects/123/views/234', 4],
    ['single param parameterized path', '/users/:id/details', 3],
    ['multi param parameterized path', '/stores/:storeId/products/:productId', 4],
    ['regex path', String(/\/api\/post[0-9]/), 2],
  ])('%s', (_: string, input, output) => {
    expect(getNumberOfUrlSegments(input)).toEqual(output);
  });
});

describe('checkRouteForAsyncHandler', () => {
  it('should not create nested proxies when called multiple times on the same route', () => {
    const mockHandler = () => Promise.resolve([]);
    const route: RouteObject = {
      path: '/test',
      handle: {
        lazyChildren: mockHandler,
      },
    };

    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

    const proxiedHandler = route.handle?.lazyChildren;
    expect(typeof proxiedHandler).toBe('function');
    expect(proxiedHandler).not.toBe(mockHandler);

    expect((proxiedHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);

    const proxyHandler = (proxiedHandler as any)?.__sentry_proxied__;
    expect(proxyHandler).toBe(true);
  });

  it('should handle routes without handle property', () => {
    const route: RouteObject = {
      path: '/test',
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with non-function handle properties', () => {
    const route: RouteObject = {
      path: '/test',
      handle: {
        someData: 'not a function',
      },
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with null/undefined handle properties', () => {
    const route: RouteObject = {
      path: '/test',
      handle: null as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with mixed function and non-function handle properties', () => {
    const mockHandler = () => Promise.resolve([]);
    const route: RouteObject = {
      path: '/test',
      handle: {
        lazyChildren: mockHandler,
        someData: 'not a function',
        anotherData: 123,
      },
    };

    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

    const proxiedHandler = route.handle?.lazyChildren;
    expect(typeof proxiedHandler).toBe('function');
    expect(proxiedHandler).not.toBe(mockHandler);
    expect((proxiedHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);

    // Non-function properties should remain unchanged
    expect(route.handle?.someData).toBe('not a function');
    expect(route.handle?.anotherData).toBe(123);
  });

  it('should handle nested routes with async handlers', () => {
    const parentHandler = () => Promise.resolve([]);
    const childHandler = () => Promise.resolve([]);

    const route: RouteObject = {
      path: '/parent',
      handle: {
        lazyChildren: parentHandler,
      },
      children: [
        {
          path: '/child',
          handle: {
            lazyChildren: childHandler,
          },
        },
      ],
    };

    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

    // Check parent handler is proxied
    const proxiedParentHandler = route.handle?.lazyChildren;
    expect(typeof proxiedParentHandler).toBe('function');
    expect(proxiedParentHandler).not.toBe(parentHandler);
    expect((proxiedParentHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);

    // Check child handler is proxied
    const proxiedChildHandler = route.children?.[0]?.handle?.lazyChildren;
    expect(typeof proxiedChildHandler).toBe('function');
    expect(proxiedChildHandler).not.toBe(childHandler);
    expect((proxiedChildHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
  });

  it('should handle deeply nested routes', () => {
    const level1Handler = () => Promise.resolve([]);
    const level2Handler = () => Promise.resolve([]);
    const level3Handler = () => Promise.resolve([]);

    const route: RouteObject = {
      path: '/level1',
      handle: {
        lazyChildren: level1Handler,
      },
      children: [
        {
          path: '/level2',
          handle: {
            lazyChildren: level2Handler,
          },
          children: [
            {
              path: '/level3',
              handle: {
                lazyChildren: level3Handler,
              },
            },
          ],
        },
      ],
    };

    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

    // Check all handlers are proxied
    expect((route.handle?.lazyChildren as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
    expect((route.children?.[0]?.handle?.lazyChildren as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(
      true,
    );
    expect(
      (route.children?.[0]?.children?.[0]?.handle?.lazyChildren as { __sentry_proxied__?: boolean }).__sentry_proxied__,
    ).toBe(true);
  });

  it('should handle routes with multiple async handlers', () => {
    const handler1 = () => Promise.resolve([]);
    const handler2 = () => Promise.resolve([]);
    const handler3 = () => Promise.resolve([]);

    const route: RouteObject = {
      path: '/test',
      handle: {
        lazyChildren: handler1,
        asyncLoader: handler2,
        dataLoader: handler3,
      },
    };

    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

    // Check all handlers are proxied
    expect((route.handle?.lazyChildren as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
    expect((route.handle?.asyncLoader as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
    expect((route.handle?.dataLoader as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
  });

  it('should not re-proxy already proxied functions', () => {
    const mockHandler = () => Promise.resolve([]);
    const route: RouteObject = {
      path: '/test',
      handle: {
        lazyChildren: mockHandler,
      },
    };

    // First call should proxy the function
    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
    const firstProxiedHandler = route.handle?.lazyChildren;
    expect(firstProxiedHandler).not.toBe(mockHandler);
    expect((firstProxiedHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);

    // Second call should not create a new proxy
    checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
    const secondProxiedHandler = route.handle?.lazyChildren;
    expect(secondProxiedHandler).toBe(firstProxiedHandler); // Should be the same proxy
    expect((secondProxiedHandler as { __sentry_proxied__?: boolean }).__sentry_proxied__).toBe(true);
  });

  it('should handle routes with empty children array', () => {
    const route: RouteObject = {
      path: '/test',
      children: [],
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with undefined children', () => {
    const route: RouteObject = {
      path: '/test',
      children: undefined,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with null children', () => {
    const route: RouteObject = {
      path: '/test',
      children: null as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with non-array children', () => {
    const route: RouteObject = {
      path: '/test',
      children: 'not an array' as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is not an object', () => {
    const route: RouteObject = {
      path: '/test',
      handle: 'not an object' as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is null', () => {
    const route: RouteObject = {
      path: '/test',
      handle: null as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is undefined', () => {
    const route: RouteObject = {
      path: '/test',
      handle: undefined as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is a function', () => {
    const route: RouteObject = {
      path: '/test',
      handle: (() => {}) as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is a string', () => {
    const route: RouteObject = {
      path: '/test',
      handle: 'string handle' as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is a number', () => {
    const route: RouteObject = {
      path: '/test',
      handle: 42 as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is a boolean', () => {
    const route: RouteObject = {
      path: '/test',
      handle: true as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });

  it('should handle routes with handle that is an array', () => {
    const route: RouteObject = {
      path: '/test',
      handle: [] as any,
    };

    expect(() => checkRouteForAsyncHandler(route, mockProcessResolvedRoutes)).not.toThrow();
  });
});
