import { WINDOW } from '@sentry/browser';
import { addNonEnumerableProperty, debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRouteForAsyncHandler,
  clearNavigationContext,
  createAsyncHandlerProxy,
  getNavigationContext,
  handleAsyncHandlerResult,
  setNavigationContext,
} from '../../src/reactrouter-compat-utils';
import type { RouteObject } from '../../src/types';

vi.mock('@sentry/core', async requireActual => {
  const actual = await requireActual();
  return {
    ...(actual as any),
    addNonEnumerableProperty: vi.fn(),
    debug: {
      warn: vi.fn(),
    },
  };
});

vi.mock('../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));

// Create a mutable mock for WINDOW.location that we can modify in tests
vi.mock('@sentry/browser', async requireActual => {
  const actual = await requireActual();
  return {
    ...(actual as any),
    WINDOW: {
      location: {
        pathname: '/default',
        search: '',
        hash: '',
      },
    },
  };
});

describe('reactrouter-compat-utils/lazy-routes', () => {
  let mockProcessResolvedRoutes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessResolvedRoutes = vi.fn();
  });

  describe('createAsyncHandlerProxy', () => {
    it('should create a proxy that calls the original function', () => {
      const originalFunction = vi.fn(() => 'result');
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      const result = proxy('arg1', 'arg2');

      expect(originalFunction).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('result');
    });

    it('should preserve the original function context (this binding)', () => {
      const context = { value: 'test' };
      const originalFunction = vi.fn(function (this: typeof context) {
        return this.value;
      });
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      const result = proxy.call(context);

      expect(originalFunction).toHaveBeenCalledWith();
      expect(result).toBe('test');
    });

    it('should handle functions with no arguments', () => {
      const originalFunction = vi.fn(() => 'no-args-result');
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      const result = proxy();

      expect(originalFunction).toHaveBeenCalledWith();
      expect(result).toBe('no-args-result');
    });

    it('should handle functions with many arguments', () => {
      const originalFunction = vi.fn((...args) => args.length);
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      const result = proxy(1, 2, 3, 4, 5);

      expect(originalFunction).toHaveBeenCalledWith(1, 2, 3, 4, 5);
      expect(result).toBe(5);
    });

    it('should mark the proxy with __sentry_proxied__ property', () => {
      const originalFunction = vi.fn();
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      expect(addNonEnumerableProperty).toHaveBeenCalledWith(expect.any(Function), '__sentry_proxied__', true);
    });

    it('should call handleAsyncHandlerResult with the function result', () => {
      const originalFunction = vi.fn(() => ['route1', 'route2']);
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      proxy();

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(
        ['route1', 'route2'],
        route,
        expect.objectContaining({ pathname: '/default' }), // Falls back to WINDOW.location
        undefined,
      );
    });

    it('should handle functions that throw exceptions', () => {
      const originalFunction = vi.fn(() => {
        throw new Error('Test error');
      });
      const route: RouteObject = { path: '/test' };
      const handlerKey = 'testHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);

      expect(() => proxy()).toThrow('Test error');
      expect(originalFunction).toHaveBeenCalled();
    });

    it('should handle complex route objects', () => {
      const originalFunction = vi.fn(() => []);
      const route: RouteObject = {
        path: '/complex',
        id: 'complex-route',
        index: false,
        caseSensitive: true,
        children: [{ path: 'child' }],
        element: '<div>Test</div>',
      };
      const handlerKey = 'complexHandler';

      const proxy = createAsyncHandlerProxy(originalFunction, route, handlerKey, mockProcessResolvedRoutes);
      proxy();

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(
        [],
        route,
        expect.objectContaining({ pathname: '/default' }), // Falls back to WINDOW.location
        undefined,
      );
    });
  });

  describe('handleAsyncHandlerResult', () => {
    const route: RouteObject = { path: '/test' };
    const handlerKey = 'testHandler';
    const mockLocation = { pathname: '/test', search: '', hash: '', state: null, key: 'default' };

    it('should handle array results directly', () => {
      const routes: RouteObject[] = [{ path: '/route1' }, { path: '/route2' }];

      handleAsyncHandlerResult(routes, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, mockLocation, undefined);
    });

    it('should handle empty array results', () => {
      const routes: RouteObject[] = [];

      handleAsyncHandlerResult(routes, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, mockLocation, undefined);
    });

    it('should handle Promise results that resolve to arrays', async () => {
      const routes: RouteObject[] = [{ path: '/route1' }, { path: '/route2' }];
      const promiseResult = Promise.resolve(routes);

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      // Wait for the promise to resolve
      await promiseResult;

      // Use setTimeout to wait for the async handling
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, mockLocation, undefined);
    });

    it('should handle Promise results that resolve to empty arrays', async () => {
      const routes: RouteObject[] = [];
      const promiseResult = Promise.resolve(routes);

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      await promiseResult;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, mockLocation, undefined);
    });

    it('should handle Promise results that resolve to non-arrays', async () => {
      const promiseResult = Promise.resolve('not an array');

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      await promiseResult;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle Promise results that resolve to null', async () => {
      const promiseResult = Promise.resolve(null);

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      await promiseResult;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle Promise results that resolve to undefined', async () => {
      const promiseResult = Promise.resolve(undefined);

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      await promiseResult;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle Promise rejections gracefully', async () => {
      const promiseResult = Promise.reject(new Error('Test error'));

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      // Wait for the promise to be handled
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(debug.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error resolving async handler'),
        route,
        expect.any(Error),
      );
      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle Promise rejections with non-Error values', async () => {
      const promiseResult = Promise.reject('string error');

      handleAsyncHandlerResult(promiseResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(debug.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error resolving async handler'),
        route,
        'string error',
      );
      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should ignore non-promise, non-array results', () => {
      handleAsyncHandlerResult('string result', route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);
      handleAsyncHandlerResult(123, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);
      handleAsyncHandlerResult({ not: 'array' }, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);
      handleAsyncHandlerResult(null, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);
      handleAsyncHandlerResult(undefined, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should ignore boolean values', () => {
      handleAsyncHandlerResult(true, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);
      handleAsyncHandlerResult(false, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should ignore functions as results', () => {
      const functionResult = () => 'test';
      handleAsyncHandlerResult(functionResult, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it("should handle objects that look like promises but aren't", () => {
      const fakeThenableButNotPromise = {
        then: 'not a function',
      };

      handleAsyncHandlerResult(
        fakeThenableButNotPromise,
        route,
        handlerKey,
        mockProcessResolvedRoutes,
        mockLocation,
        undefined,
      );

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle objects that have then property but not a function', () => {
      const almostPromise = {
        then: null,
      };

      handleAsyncHandlerResult(almostPromise, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).not.toHaveBeenCalled();
    });

    it('should handle complex route objects in async handling', async () => {
      const complexRoute: RouteObject = {
        path: '/complex',
        id: 'complex-route',
        loader: vi.fn(),
        element: '<div>Complex</div>',
      };
      const routes: RouteObject[] = [{ path: '/dynamic1' }, { path: '/dynamic2' }];
      const promiseResult = Promise.resolve(routes);

      handleAsyncHandlerResult(
        promiseResult,
        complexRoute,
        'complexHandler',
        mockProcessResolvedRoutes,
        mockLocation,
        undefined,
      );

      await promiseResult;
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, complexRoute, mockLocation, undefined);
    });

    it('should handle nested route objects in arrays', () => {
      const routes: RouteObject[] = [
        {
          path: '/parent',
          children: [{ path: 'child1' }, { path: 'child2', children: [{ path: 'grandchild' }] }],
        },
      ];

      handleAsyncHandlerResult(routes, route, handlerKey, mockProcessResolvedRoutes, mockLocation, undefined);

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, mockLocation, undefined);
    });

    it('should convert null location to undefined for processResolvedRoutes', () => {
      const routes: RouteObject[] = [{ path: '/route1' }];

      handleAsyncHandlerResult(routes, route, handlerKey, mockProcessResolvedRoutes, null, undefined);

      // When null is passed, it should convert to undefined for processResolvedRoutes
      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(routes, route, undefined, undefined);
    });
  });

  describe('checkRouteForAsyncHandler', () => {
    it('should proxy functions in route.handle', () => {
      const testFunction = vi.fn();
      const route: RouteObject = {
        path: '/test',
        handle: {
          testHandler: testFunction,
          notAFunction: 'string value',
        },
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // The function should be replaced with a proxy
      expect(route.handle!.testHandler).not.toBe(testFunction);
      expect(typeof route.handle!.testHandler).toBe('function');
      expect(route.handle!.notAFunction).toBe('string value');
    });

    it('should handle multiple functions in route.handle', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      const route: RouteObject = {
        path: '/test',
        handle: {
          handler1,
          handler2,
          handler3,
          nonFunction: 'not a function',
          anotherNonFunction: 42,
        },
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // All functions should be proxied
      expect(route.handle!.handler1).not.toBe(handler1);
      expect(route.handle!.handler2).not.toBe(handler2);
      expect(route.handle!.handler3).not.toBe(handler3);
      expect(typeof route.handle!.handler1).toBe('function');
      expect(typeof route.handle!.handler2).toBe('function');
      expect(typeof route.handle!.handler3).toBe('function');

      // Non-functions should remain unchanged
      expect(route.handle!.nonFunction).toBe('not a function');
      expect(route.handle!.anotherNonFunction).toBe(42);
    });

    it('should not proxy already proxied functions', () => {
      const testFunction = vi.fn();
      // Mark function as already proxied
      (testFunction as any).__sentry_proxied__ = true;

      const route: RouteObject = {
        path: '/test',
        handle: {
          testHandler: testFunction,
        },
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // The function should remain unchanged
      expect(route.handle!.testHandler).toBe(testFunction);
    });

    it('should handle mix of proxied and non-proxied functions', () => {
      const proxiedFunction = vi.fn();
      const normalFunction = vi.fn();
      (proxiedFunction as any).__sentry_proxied__ = true;

      const route: RouteObject = {
        path: '/test',
        handle: {
          proxiedHandler: proxiedFunction,
          normalHandler: normalFunction,
        },
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // Proxied function should remain unchanged
      expect(route.handle!.proxiedHandler).toBe(proxiedFunction);
      // Normal function should be proxied
      expect(route.handle!.normalHandler).not.toBe(normalFunction);
    });

    it('should recursively check child routes', () => {
      const parentFunction = vi.fn();
      const childFunction = vi.fn();

      const route: RouteObject = {
        path: '/parent',
        handle: {
          parentHandler: parentFunction,
        },
        children: [
          {
            path: 'child',
            handle: {
              childHandler: childFunction,
            },
          },
        ],
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // Both parent and child functions should be proxied
      expect(route.handle!.parentHandler).not.toBe(parentFunction);
      expect(route.children![0].handle!.childHandler).not.toBe(childFunction);
    });

    it('should handle children without handle properties', () => {
      const parentFunction = vi.fn();

      const route: RouteObject = {
        path: '/parent',
        handle: {
          parentHandler: parentFunction,
        },
        children: [
          {
            path: 'child1',
            // No handle property
          },
          {
            path: 'child2',
            handle: undefined,
          },
        ],
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();

      expect(route.handle!.parentHandler).not.toBe(parentFunction);
    });

    it('should handle routes without handle property', () => {
      const route: RouteObject = {
        path: '/test',
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes with null handle property', () => {
      const route: RouteObject = {
        path: '/test',
        handle: null,
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes with handle that is not an object', () => {
      const route: RouteObject = {
        path: '/test',
        // @ts-expect-error - Testing edge case
        handle: 'not an object',
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes with handle that is a function', () => {
      const route: RouteObject = {
        path: '/test',
        // @ts-expect-error - Testing edge case
        handle: vi.fn(),
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes without children', () => {
      const testFunction = vi.fn();
      const route: RouteObject = {
        path: '/test',
        handle: {
          testHandler: testFunction,
        },
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes with null children', () => {
      const testFunction = vi.fn();
      const route: RouteObject = {
        path: '/test',
        handle: {
          testHandler: testFunction,
        },
        children: null,
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle routes with empty children array', () => {
      const testFunction = vi.fn();
      const route: RouteObject = {
        path: '/test',
        handle: {
          testHandler: testFunction,
        },
        children: [],
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();
    });

    it('should handle deeply nested child routes', () => {
      const grandParentFunction = vi.fn();
      const parentFunction = vi.fn();
      const childFunction = vi.fn();

      const route: RouteObject = {
        path: '/grandparent',
        handle: {
          grandParentHandler: grandParentFunction,
        },
        children: [
          {
            path: 'parent',
            handle: {
              parentHandler: parentFunction,
            },
            children: [
              {
                path: 'child',
                handle: {
                  childHandler: childFunction,
                },
              },
            ],
          },
        ],
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // All functions should be proxied
      expect(route.handle!.grandParentHandler).not.toBe(grandParentFunction);
      expect(route.children![0].handle!.parentHandler).not.toBe(parentFunction);
      expect(route.children![0].children![0].handle!.childHandler).not.toBe(childFunction);
    });

    it('should handle routes with complex nested structures', () => {
      const route: RouteObject = {
        path: '/complex',
        handle: {
          handler1: vi.fn(),
          handler2: vi.fn(),
        },
        children: [
          {
            path: 'level1a',
            handle: {
              level1aHandler: vi.fn(),
            },
            children: [
              {
                path: 'level2a',
                handle: {
                  level2aHandler: vi.fn(),
                },
              },
              {
                path: 'level2b',
                // No handle
              },
            ],
          },
          {
            path: 'level1b',
            // No handle
            children: [
              {
                path: 'level2c',
                handle: {
                  level2cHandler: vi.fn(),
                },
              },
            ],
          },
        ],
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();

      // Check that functions were proxied at all levels
      expect(typeof route.handle!.handler1).toBe('function');
      expect(typeof route.handle!.handler2).toBe('function');
      expect(typeof route.children![0].handle!.level1aHandler).toBe('function');
      expect(typeof route.children![0].children![0].handle!.level2aHandler).toBe('function');
      expect(typeof route.children![1].children![0].handle!.level2cHandler).toBe('function');
    });

    it('should preserve route properties during processing', () => {
      const originalFunction = vi.fn();
      const route: RouteObject = {
        path: '/preserve',
        id: 'preserve-route',
        caseSensitive: true,
        index: false,
        handle: {
          testHandler: originalFunction,
        },
        element: '<div>Test</div>',
        loader: vi.fn(),
      };

      checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);

      // Route properties should be preserved
      expect(route.path).toBe('/preserve');
      expect(route.id).toBe('preserve-route');
      expect(route.caseSensitive).toBe(true);
      expect(route.index).toBe(false);
      expect(route.element).toBe('<div>Test</div>');
      expect(route.loader).toBeDefined();

      // Only the handler function should be changed
      expect(route.handle!.testHandler).not.toBe(originalFunction);
    });

    it('should handle functions with special names', () => {
      const route: RouteObject = {
        path: '/test',
        handle: {
          constructor: vi.fn(),
          toString: vi.fn(),
          valueOf: vi.fn(),
          hasOwnProperty: vi.fn(),
          '0': vi.fn(),
          'special-name': vi.fn(),
          'with spaces': vi.fn(),
        },
      };

      expect(() => {
        checkRouteForAsyncHandler(route, mockProcessResolvedRoutes);
      }).not.toThrow();

      // All functions should be proxied regardless of name
      expect(typeof route.handle!.constructor).toBe('function');
      expect(typeof route.handle!.toString).toBe('function');
      expect(typeof route.handle!.valueOf).toBe('function');
      expect(typeof route.handle!.hasOwnProperty).toBe('function');
      expect(typeof route.handle!['0']).toBe('function');
      expect(typeof route.handle!['special-name']).toBe('function');
      expect(typeof route.handle!['with spaces']).toBe('function');
    });
  });

  describe('captureCurrentLocation edge cases', () => {
    afterEach(() => {
      (WINDOW as any).location = { pathname: '/default', search: '', hash: '' };
      // Clean up any leaked navigation contexts
      let ctx;
      while ((ctx = getNavigationContext()) !== null) {
        clearNavigationContext((ctx as any).token);
      }
    });

    it('should use navigation context targetPath when defined', () => {
      const token = setNavigationContext('/original-route', undefined);
      (WINDOW as any).location = { pathname: '/different-route', search: '', hash: '' };

      const originalFunction = vi.fn(() => [{ path: '/child' }]);
      const route: RouteObject = { path: '/test' };

      const proxy = createAsyncHandlerProxy(originalFunction, route, 'handler', mockProcessResolvedRoutes);
      proxy();

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(
        [{ path: '/child' }],
        route,
        expect.objectContaining({ pathname: '/original-route' }),
        undefined,
      );

      clearNavigationContext(token);
    });

    it('should not fall back to WINDOW.location when targetPath is undefined', () => {
      // targetPath can be undefined when patchRoutesOnNavigation is called with args.path = undefined
      const token = setNavigationContext(undefined, undefined);
      (WINDOW as any).location = { pathname: '/wrong-route-from-window', search: '', hash: '' };

      const originalFunction = vi.fn(() => [{ path: '/child' }]);
      const route: RouteObject = { path: '/test' };

      const proxy = createAsyncHandlerProxy(originalFunction, route, 'handler', mockProcessResolvedRoutes);
      proxy();

      expect(mockProcessResolvedRoutes).toHaveBeenCalledWith(
        [{ path: '/child' }],
        route,
        undefined, // Does not fall back to WINDOW.location
        undefined,
      );

      clearNavigationContext(token);
    });
  });
});
