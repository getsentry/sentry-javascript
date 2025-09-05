/**
 * @vitest-environment jsdom
 */
import { startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Client, Span } from '@sentry/core';
import { addNonEnumerableProperty } from '@sentry/core';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addResolvedRoutesToParent,
  createNewNavigationSpan,
  createReactRouterV6CompatibleTracingIntegration,
  updateNavigationSpan,
} from '../../src/reactrouter-compat-utils';
import type { Location, RouteObject } from '../../src/types';

const mockUpdateName = vi.fn();
const mockSetAttribute = vi.fn();
const mockSpan = { updateName: mockUpdateName, setAttribute: mockSetAttribute } as unknown as Span;
const mockClient = { addIntegration: vi.fn() } as unknown as Client;

vi.mock('@sentry/core', async requireActual => {
  const actual = await requireActual();
  return {
    ...(actual as any),
    addNonEnumerableProperty: vi.fn(),
    getActiveSpan: vi.fn(() => mockSpan),
    getClient: vi.fn(() => mockClient),
    getRootSpan: vi.fn(() => mockSpan),
    spanToJSON: vi.fn(() => ({ op: 'navigation' })),
  };
});

vi.mock('@sentry/browser', async requireActual => {
  const actual = await requireActual();
  return {
    ...(actual as any),
    startBrowserTracingNavigationSpan: vi.fn(),
    browserTracingIntegration: vi.fn(() => ({
      setup: vi.fn(),
      afterAllSetup: vi.fn(),
      name: 'BrowserTracing',
    })),
  };
});

vi.mock('../../src/reactrouter-compat-utils/utils', () => ({
  resolveRouteNameAndSource: vi.fn(() => ['Test Route', 'route']),
  initializeRouterUtils: vi.fn(),
  getGlobalLocation: vi.fn(() => ({ pathname: '/test', search: '', hash: '' })),
  getGlobalPathname: vi.fn(() => '/test'),
}));

vi.mock('../../src/reactrouter-compat-utils/lazy-routes', () => ({
  checkRouteForAsyncHandler: vi.fn(),
}));

describe('reactrouter-compat-utils/instrumentation', () => {
  const sampleLocation: Location = {
    pathname: '/test',
    search: '',
    hash: '',
    state: null,
    key: 'default',
  };

  const sampleRoutes: RouteObject[] = [
    { path: '/', element: <div>Home</div> },
    { path: '/about', element: <div>About</div> },
  ];

  const mockMatchRoutes = vi.fn(() => []);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateNavigationSpan', () => {
    it('should update navigation span name and source when not already named', () => {
      updateNavigationSpan(mockSpan, sampleLocation, sampleRoutes, false, mockMatchRoutes);

      expect(mockUpdateName).toHaveBeenCalledWith('Test Route');
      expect(mockSetAttribute).toHaveBeenCalledWith('sentry.source', 'route');
      expect(addNonEnumerableProperty).toHaveBeenCalledWith(mockSpan, '__sentry_navigation_name_set__', true);
    });

    it('should not update when span already has name set', () => {
      const spanWithNameSet = { ...mockSpan, __sentry_navigation_name_set__: true };

      updateNavigationSpan(spanWithNameSet as any, sampleLocation, sampleRoutes, false, mockMatchRoutes);

      expect(mockUpdateName).not.toHaveBeenCalled();
    });
  });
  describe('createNewNavigationSpan', () => {
    it('should create new navigation span with correct attributes', () => {
      createNewNavigationSpan(mockClient, 'Test Route', 'route', '6', false);

      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(mockClient, {
        name: 'Test Route',
        attributes: {
          'sentry.source': 'route',
          'sentry.op': 'navigation',
          'sentry.origin': 'auto.navigation.react.reactrouter_v6',
        },
      });
    });
  });

  describe('addResolvedRoutesToParent', () => {
    it('should add new routes to parent with no existing children', () => {
      const parentRoute: RouteObject = { path: '/parent', element: <div>Parent</div> };
      const resolvedRoutes = [{ path: '/child1', element: <div>Child 1</div> }];

      addResolvedRoutesToParent(resolvedRoutes, parentRoute);

      expect(parentRoute.children).toEqual(resolvedRoutes);
    });

    it('should not add duplicate routes by path', () => {
      const existingRoute = { path: '/duplicate', element: <div>Existing</div> };
      const parentRoute: RouteObject = {
        path: '/parent',
        element: <div>Parent</div>,
        children: [existingRoute],
      };
      const duplicateRoute = { path: '/duplicate', element: <div>Duplicate</div> };

      addResolvedRoutesToParent([duplicateRoute], parentRoute);

      expect(parentRoute.children).toEqual([existingRoute]);
    });
  });

  describe('createReactRouterV6CompatibleTracingIntegration', () => {
    it('should create integration with correct setup', () => {
      const mockUseEffect = vi.fn();
      const mockUseLocation = vi.fn();
      const mockUseNavigationType = vi.fn();
      const mockCreateRoutesFromChildren = vi.fn();

      const integration = createReactRouterV6CompatibleTracingIntegration(
        {
          useEffect: mockUseEffect,
          useLocation: mockUseLocation,
          useNavigationType: mockUseNavigationType,
          createRoutesFromChildren: mockCreateRoutesFromChildren,
          matchRoutes: mockMatchRoutes,
        },
        '6',
      );

      expect(integration).toHaveProperty('setup');
      expect(integration).toHaveProperty('afterAllSetup');
      expect(typeof integration.setup).toBe('function');
      expect(typeof integration.afterAllSetup).toBe('function');
    });
  });
});
