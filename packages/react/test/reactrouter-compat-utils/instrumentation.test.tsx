/**
 * @vitest-environment jsdom
 */
import type { Client, Span } from '@sentry/core';
import { addNonEnumerableProperty } from '@sentry/core';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addResolvedRoutesToParent,
  createReactRouterV6CompatibleTracingIntegration,
  updateNavigationSpan,
} from '../../src/reactrouter-compat-utils';
import { addRoutesToAllRoutes, allRoutes } from '../../src/reactrouter-compat-utils/instrumentation';
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
  routeIsDescendant: vi.fn(() => false),
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

describe('addRoutesToAllRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    allRoutes.clear();
  });

  it('should add simple routes without nesting', () => {
    const routes = [
      { path: '/', element: <div /> },
      { path: '/user/:id', element: <div /> },
      { path: '/group/:group/:user?', element: <div /> },
    ];

    addRoutesToAllRoutes(routes);
    const allRoutesArr = Array.from(allRoutes);

    expect(allRoutesArr).toHaveLength(3);
    expect(allRoutesArr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/' }),
        expect.objectContaining({ path: '/user/:id' }),
        expect.objectContaining({ path: '/group/:group/:user?' }),
      ]),
    );

    // Verify exact structure matches manual testing results
    allRoutesArr.forEach(route => {
      expect(route).toHaveProperty('element');
      expect(route.element).toHaveProperty('props');
    });
  });

  it('should handle complex nested routes with multiple levels', () => {
    const routes = [
      { path: '/', element: <div /> },
      { path: '/user/:id', element: <div /> },
      { path: '/group/:group/:user?', element: <div /> },
      {
        path: '/v1/post/:post',
        element: <div />,
        children: [
          { path: 'featured', element: <div /> },
          { path: '/v1/post/:post/related', element: <div /> },
          {
            element: <div>More Nested Children</div>,
            children: [{ path: 'edit', element: <div>Edit Post</div> }],
          },
        ],
      },
      {
        path: '/v2/post/:post',
        element: <div />,
        children: [
          { index: true, element: <div /> },
          { path: 'featured', element: <div /> },
          { path: '/v2/post/:post/related', element: <div /> },
        ],
      },
    ];

    addRoutesToAllRoutes(routes);
    const allRoutesArr = Array.from(allRoutes);

    expect(allRoutesArr).toEqual([
      {
        path: '/',
        element: expect.objectContaining({ type: 'div', props: {} }),
      },
      {
        path: '/user/:id',
        element: expect.objectContaining({ type: 'div', props: {} }),
      },
      {
        path: '/group/:group/:user?',
        element: expect.objectContaining({ type: 'div', props: {} }),
      },
      {
        path: '/v1/post/:post',
        element: expect.objectContaining({ type: 'div', props: {} }),
        children: [
          { element: <div />, path: 'featured' },
          { element: <div />, path: '/v1/post/:post/related' },
          { children: [{ element: <div>Edit Post</div>, path: 'edit' }], element: <div>More Nested Children</div> },
        ],
      },
      {
        path: '/v2/post/:post',
        element: expect.objectContaining({ type: 'div', props: {} }),
        children: [
          { element: <div />, index: true },
          { element: <div />, path: 'featured' },
          { element: <div />, path: '/v2/post/:post/related' },
        ],
      },
    ]);
  });

  it('should handle routes with nested index routes', () => {
    const routes = [
      {
        path: '/dashboard',
        element: <div />,
        children: [
          { index: true, element: <div>Dashboard Index</div> },
          { path: 'settings', element: <div>Settings</div> },
        ],
      },
    ];

    addRoutesToAllRoutes(routes);
    const allRoutesArr = Array.from(allRoutes);

    expect(allRoutesArr).toEqual([
      {
        path: '/dashboard',
        element: expect.objectContaining({ type: 'div' }),
        children: [
          { element: <div>Dashboard Index</div>, index: true },
          { element: <div>Settings</div>, path: 'settings' },
        ],
      },
    ]);
  });

  it('should handle deeply nested routes with layout wrappers', () => {
    const routes = [
      {
        path: '/',
        element: <div>Root</div>,
        children: [
          { path: 'contact', element: <div>Contact</div> },
          { path: 'dashboard', element: <div>Dashboard</div> },
          {
            element: <div>AuthLayout</div>,
            children: [
              { path: 'login', element: <div>Login</div> },
              { path: 'logout', element: <div>Logout</div> },
            ],
          },
        ],
      },
    ];

    addRoutesToAllRoutes(routes);
    const allRoutesArr = Array.from(allRoutes);

    expect(allRoutesArr).toEqual([
      {
        path: '/',
        element: expect.objectContaining({ type: 'div', props: { children: 'Root' } }),
        children: [
          {
            path: 'contact',
            element: expect.objectContaining({ type: 'div', props: { children: 'Contact' } }),
          },
          {
            path: 'dashboard',
            element: expect.objectContaining({ type: 'div', props: { children: 'Dashboard' } }),
          },
          {
            element: expect.objectContaining({ type: 'div', props: { children: 'AuthLayout' } }),
            children: [
              {
                path: 'login',
                element: expect.objectContaining({ type: 'div', props: { children: 'Login' } }),
              },
              {
                path: 'logout',
                element: expect.objectContaining({ type: 'div', props: { children: 'Logout' } }),
              },
            ],
          },
        ],
      },
    ]);
  });

  it('should not duplicate routes when called multiple times', () => {
    const routes = [
      { path: '/', element: <div /> },
      { path: '/about', element: <div /> },
    ];

    addRoutesToAllRoutes(routes);
    const firstCount = allRoutes.size;

    addRoutesToAllRoutes(routes);
    const secondCount = allRoutes.size;

    expect(firstCount).toBe(secondCount);
  });
});
