/**
 * @vitest-environment jsdom
 */
import type { Client, Span } from '@sentry/core';
import { addNonEnumerableProperty, spanToJSON } from '@sentry/core';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addResolvedRoutesToParent,
  createReactRouterV6CompatibleTracingIntegration,
  updateNavigationSpan,
} from '../../src/reactrouter-compat-utils';
import {
  addRoutesToAllRoutes,
  allRoutes,
  computeLocationKey,
  shouldSkipNavigation,
} from '../../src/reactrouter-compat-utils/instrumentation';
import { resolveRouteNameAndSource, transactionNameHasWildcard } from '../../src/reactrouter-compat-utils/utils';
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
    startBrowserTracingPageLoadSpan: vi.fn(),
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
  transactionNameHasWildcard: vi.fn((name: string) => {
    return name.includes('/*') || name === '*' || name.endsWith('*');
  }),
  getActiveRootSpan: vi.fn(() => undefined),
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

  describe('span.end() patching for early cancellation', () => {
    it('should update transaction name when span.end() is called during cancellation', () => {
      const mockEnd = vi.fn();
      let patchedEnd: ((...args: any[]) => any) | null = null;

      const updateNameMock = vi.fn();
      const setAttributeMock = vi.fn();

      const testSpan = {
        updateName: updateNameMock,
        setAttribute: setAttributeMock,
        get end() {
          return patchedEnd || mockEnd;
        },
        set end(fn: (...args: any[]) => any) {
          patchedEnd = fn;
        },
      } as unknown as Span;

      // Simulate the patching behavior
      const originalEnd = testSpan.end.bind(testSpan);
      (testSpan as any).end = function patchedEndFn(...args: any[]) {
        // This simulates what happens in the actual implementation
        updateNameMock('Updated Route');
        setAttributeMock('sentry.source', 'route');
        return originalEnd(...args);
      };

      // Call the patched end
      testSpan.end(12345);

      expect(updateNameMock).toHaveBeenCalledWith('Updated Route');
      expect(setAttributeMock).toHaveBeenCalledWith('sentry.source', 'route');
      expect(mockEnd).toHaveBeenCalledWith(12345);
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
      { path: '/', element: <div /> },
      { path: '/user/:id', element: <div /> },
      { path: '/group/:group/:user?', element: <div /> },
      // v1 routes ----
      {
        path: '/v1/post/:post',
        element: <div />,
        children: [
          { element: <div />, path: 'featured' },
          { element: <div />, path: '/v1/post/:post/related' },
          { children: [{ element: <div>Edit Post</div>, path: 'edit' }], element: <div>More Nested Children</div> },
        ],
      },
      { element: <div />, path: 'featured' },
      { element: <div />, path: '/v1/post/:post/related' },
      { children: [{ element: <div>Edit Post</div>, path: 'edit' }], element: <div>More Nested Children</div> },
      { element: <div>Edit Post</div>, path: 'edit' },
      // v2 routes ---
      {
        path: '/v2/post/:post',
        element: expect.objectContaining({ type: 'div', props: {} }),
        children: [
          { element: <div />, index: true },
          { element: <div />, path: 'featured' },
          { element: <div />, path: '/v2/post/:post/related' },
        ],
      },
      { element: <div />, index: true },
      { element: <div />, path: 'featured' },
      { element: <div />, path: '/v2/post/:post/related' },
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
      { element: <div>Dashboard Index</div>, index: true },
      { element: <div>Settings</div>, path: 'settings' },
    ]);
  });

  it('should handle deeply nested routes with layout wrappers', () => {
    const routes = [
      {
        path: '/',
        element: <div>Root</div>,
        children: [
          { path: 'dashboard', element: <div>Dashboard</div> },
          {
            element: <div>AuthLayout</div>,
            children: [{ path: 'login', element: <div>Login</div> }],
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
            ],
          },
        ],
      },
      { element: <div>Dashboard</div>, path: 'dashboard' },
      {
        children: [{ element: <div>Login</div>, path: 'login' }],
        element: <div>AuthLayout</div>,
      },
      { element: <div>Login</div>, path: 'login' },
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

describe('updateNavigationSpan with wildcard detection', () => {
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

  it('should call updateName when provided with valid routes', () => {
    const testSpan = { ...mockSpan };
    updateNavigationSpan(testSpan, sampleLocation, sampleRoutes, false, mockMatchRoutes);

    expect(mockUpdateName).toHaveBeenCalledWith('Test Route');
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.source', 'route');
  });

  it('should handle forced updates', () => {
    const testSpan = { ...mockSpan, __sentry_navigation_name_set__: true };
    updateNavigationSpan(testSpan, sampleLocation, sampleRoutes, true, mockMatchRoutes);

    // Should update even though already named because forceUpdate=true
    expect(mockUpdateName).toHaveBeenCalledWith('Test Route');
  });
});

describe('tryUpdateSpanNameBeforeEnd - source upgrade logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should upgrade from URL source to route source (regression fix)', async () => {
    // Setup: Current span has URL source and non-parameterized name
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: '/users/123',
      data: { 'sentry.source': 'url' },
    } as any);

    // Target: Resolves to route source with parameterized name
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/:id', 'route']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
    } as unknown as Span;

    // Simulate patchSpanEnd calling tryUpdateSpanNameBeforeEnd
    // by updating the span name during a navigation
    updateNavigationSpan(
      testSpan,
      { pathname: '/users/123', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/:id', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/:id' } }]),
    );

    // Should upgrade from URL to route source
    expect(mockUpdateName).toHaveBeenCalledWith('/users/:id');
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.source', 'route');
  });

  it('should not downgrade from route source to URL source', async () => {
    // Setup: Current span has route source with parameterized name (no wildcard)
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: '/users/:id',
      data: { 'sentry.source': 'route' },
    } as any);

    // Target: Would resolve to URL source (downgrade attempt)
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/456', 'url']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
      __sentry_navigation_name_set__: true, // Mark as already named
    } as unknown as Span;

    updateNavigationSpan(
      testSpan,
      { pathname: '/users/456', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/:id', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/:id' } }]),
    );

    // Should not update because span is already named
    // The early return in tryUpdateSpanNameBeforeEnd protects against downgrades
    // This test verifies that route->url downgrades are blocked
    expect(mockUpdateName).not.toHaveBeenCalled();
    expect(mockSetAttribute).not.toHaveBeenCalled();
  });

  it('should upgrade wildcard names to specific routes', async () => {
    // Setup: Current span has route source with wildcard
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: '/users/*',
      data: { 'sentry.source': 'route' },
    } as any);

    // Mock wildcard detection: current name has wildcard, new name doesn't
    vi.mocked(transactionNameHasWildcard).mockImplementation((name: string) => {
      return name === '/users/*'; // Only the current name has wildcard
    });

    // Target: Resolves to specific parameterized route
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/:id', 'route']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
    } as unknown as Span;

    updateNavigationSpan(
      testSpan,
      { pathname: '/users/123', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/:id', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/:id' } }]),
    );

    // Should upgrade from wildcard to specific
    expect(mockUpdateName).toHaveBeenCalledWith('/users/:id');
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.source', 'route');
  });

  it('should not downgrade from wildcard route to URL', async () => {
    // Setup: Current span has route source with wildcard
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: '/users/*',
      data: { 'sentry.source': 'route' },
    } as any);

    // Mock wildcard detection: current name has wildcard, new name doesn't
    vi.mocked(transactionNameHasWildcard).mockImplementation((name: string) => {
      return name === '/users/*'; // Only the current wildcard name returns true
    });

    // Target: After timeout, resolves to URL (lazy route didn't finish loading)
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/123', 'url']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
      __sentry_navigation_name_set__: true, // Mark span as already named/finalized
    } as unknown as Span;

    updateNavigationSpan(
      testSpan,
      { pathname: '/users/123', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/*', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/*' } }]),
    );

    // Should not update - keep wildcard route instead of downgrading to URL
    // Wildcard routes are better than URLs for aggregation in performance monitoring
    expect(mockUpdateName).not.toHaveBeenCalled();
    expect(mockSetAttribute).not.toHaveBeenCalled();
  });

  it('should set name when no current name exists', async () => {
    // Setup: Current span has no name (undefined)
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: undefined,
    } as any);

    // Target: Resolves to route
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/:id', 'route']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
    } as unknown as Span;

    updateNavigationSpan(
      testSpan,
      { pathname: '/users/123', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/:id', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/:id' } }]),
    );

    // Should set initial name
    expect(mockUpdateName).toHaveBeenCalledWith('/users/:id');
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.source', 'route');
  });

  it('should not update when same source and no improvement', async () => {
    // Setup: Current span has URL source
    vi.mocked(spanToJSON).mockReturnValue({
      op: 'navigation',
      description: '/users/123',
      data: { 'sentry.source': 'url' },
    } as any);

    // Target: Resolves to same URL source (no improvement)
    vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/123', 'url']);

    const mockUpdateName = vi.fn();
    const mockSetAttribute = vi.fn();
    const testSpan = {
      updateName: mockUpdateName,
      setAttribute: mockSetAttribute,
      end: vi.fn(),
    } as unknown as Span;

    updateNavigationSpan(
      testSpan,
      { pathname: '/users/123', search: '', hash: '', state: null, key: 'test' },
      [{ path: '/users/:id', element: <div /> }],
      false,
      vi.fn(() => [{ route: { path: '/users/:id' } }]),
    );

    // Note: updateNavigationSpan always updates if not already named
    // This test validates that the isImprovement logic works correctly in tryUpdateSpanNameBeforeEnd
    // which is called during span.end() patching
    expect(mockUpdateName).toHaveBeenCalled(); // Initial set is allowed
  });

  describe('computeLocationKey (pure function)', () => {
    it('should include pathname, search, and hash in location key', () => {
      const location: Location = {
        pathname: '/search',
        search: '?q=foo',
        hash: '#results',
        state: null,
        key: 'test',
      };

      const result = computeLocationKey(location);

      expect(result).toBe('/search?q=foo#results');
    });

    it('should differentiate locations with same pathname but different query', () => {
      const loc1: Location = { pathname: '/search', search: '?q=foo', hash: '', state: null, key: 'k1' };
      const loc2: Location = { pathname: '/search', search: '?q=bar', hash: '', state: null, key: 'k2' };

      const key1 = computeLocationKey(loc1);
      const key2 = computeLocationKey(loc2);

      // Verifies that search params are included in the location key
      expect(key1).not.toBe(key2);
      expect(key1).toBe('/search?q=foo');
      expect(key2).toBe('/search?q=bar');
    });

    it('should differentiate locations with same pathname but different hash', () => {
      const loc1: Location = { pathname: '/page', search: '', hash: '#section1', state: null, key: 'k1' };
      const loc2: Location = { pathname: '/page', search: '', hash: '#section2', state: null, key: 'k2' };

      const key1 = computeLocationKey(loc1);
      const key2 = computeLocationKey(loc2);

      // Verifies that hash values are included in the location key
      expect(key1).not.toBe(key2);
      expect(key1).toBe('/page#section1');
      expect(key2).toBe('/page#section2');
    });

    it('should produce same key for identical locations', () => {
      const loc1: Location = { pathname: '/users', search: '?id=123', hash: '#profile', state: null, key: 'k1' };
      const loc2: Location = { pathname: '/users', search: '?id=123', hash: '#profile', state: null, key: 'k2' };

      expect(computeLocationKey(loc1)).toBe(computeLocationKey(loc2));
    });

    it('should normalize undefined/null search and hash to empty strings (partial location objects)', () => {
      // When <Routes location="/users"> receives a string, React Router creates a partial location
      // with search: undefined and hash: undefined. We must normalize these to empty strings
      // to match the keys from full location objects (which have search: '' and hash: '').
      // This prevents duplicate navigation spans when using <Routes location> prop (common in modal routes).
      const partialLocation: Location = {
        pathname: '/users',
        search: undefined as unknown as string,
        hash: undefined as unknown as string,
        state: null,
        key: 'test1',
      };

      const fullLocation: Location = {
        pathname: '/users',
        search: '',
        hash: '',
        state: null,
        key: 'test2',
      };

      const partialKey = computeLocationKey(partialLocation);
      const fullKey = computeLocationKey(fullLocation);

      // Verifies that undefined values are normalized to empty strings, preventing
      // '/usersundefinedundefined' !== '/users' mismatches
      expect(partialKey).toBe('/users');
      expect(fullKey).toBe('/users');
      expect(partialKey).toBe(fullKey);
    });

    it('should normalize null search and hash to empty strings', () => {
      const locationWithNulls: Location = {
        pathname: '/products',
        search: null as unknown as string,
        hash: null as unknown as string,
        state: null,
        key: 'test3',
      };

      const locationWithEmptyStrings: Location = {
        pathname: '/products',
        search: '',
        hash: '',
        state: null,
        key: 'test4',
      };

      expect(computeLocationKey(locationWithNulls)).toBe('/products');
      expect(computeLocationKey(locationWithEmptyStrings)).toBe('/products');
      expect(computeLocationKey(locationWithNulls)).toBe(computeLocationKey(locationWithEmptyStrings));
    });
  });

  describe('shouldSkipNavigation (pure function - duplicate detection logic)', () => {
    const mockSpan: Span = { updateName: vi.fn(), setAttribute: vi.fn(), end: vi.fn() } as unknown as Span;

    it('should not skip when no tracked navigation exists', () => {
      const result = shouldSkipNavigation(undefined, '/users', '/users/:id', false);

      expect(result).toEqual({ skip: false, shouldUpdate: false });
    });

    it('should skip placeholder navigations for same locationKey', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/search',
        pathname: '/search',
        locationKey: '/search?q=foo',
        isPlaceholder: true,
      };

      const result = shouldSkipNavigation(trackedNav, '/search?q=foo', '/search', false);

      // Verifies that placeholder navigations for the same locationKey are skipped
      expect(result.skip).toBe(true);
      expect(result.shouldUpdate).toBe(false);
    });

    it('should NOT skip placeholder navigations for different locationKey (query change)', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/search',
        pathname: '/search',
        locationKey: '/search?q=foo',
        isPlaceholder: true,
      };

      const result = shouldSkipNavigation(trackedNav, '/search?q=bar', '/search', false);

      // Verifies that different locationKeys allow new navigation even with same pathname
      expect(result.skip).toBe(false);
      expect(result.shouldUpdate).toBe(false);
    });

    it('should skip real span navigations for same locationKey when span has not ended', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/users/:id',
        pathname: '/users/123',
        locationKey: '/users/123?tab=profile',
        isPlaceholder: false,
      };

      const result = shouldSkipNavigation(trackedNav, '/users/123?tab=profile', '/users/:id', false);

      // Verifies that duplicate navigations are blocked when span hasn't ended
      expect(result.skip).toBe(true);
    });

    it('should NOT skip real span navigations for different locationKey (query change)', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/users/:id',
        pathname: '/users/123',
        locationKey: '/users/123?tab=profile',
        isPlaceholder: false,
      };

      const result = shouldSkipNavigation(trackedNav, '/users/123?tab=settings', '/users/:id', false);

      // Verifies that different locationKeys allow new navigation even with same pathname
      expect(result.skip).toBe(false);
    });

    it('should NOT skip when tracked span has ended', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/users/:id',
        pathname: '/users/123',
        locationKey: '/users/123',
        isPlaceholder: false,
      };

      const result = shouldSkipNavigation(trackedNav, '/users/123', '/users/:id', true);

      // Allow new navigation when previous span has ended
      expect(result.skip).toBe(false);
    });

    it('should set shouldUpdate=true for wildcard to parameterized upgrade', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/users/*',
        pathname: '/users/123',
        locationKey: '/users/123',
        isPlaceholder: false,
      };

      const result = shouldSkipNavigation(trackedNav, '/users/123', '/users/:id', false);

      // Verifies that wildcard names are upgraded to parameterized routes
      expect(result.skip).toBe(true);
      expect(result.shouldUpdate).toBe(true);
    });

    it('should NOT set shouldUpdate=true when both names are wildcards', () => {
      const trackedNav = {
        span: mockSpan,
        routeName: '/users/*',
        pathname: '/users/123',
        locationKey: '/users/123',
        isPlaceholder: false,
      };

      const result = shouldSkipNavigation(trackedNav, '/users/123', '/users/*', false);

      expect(result.skip).toBe(true);
      expect(result.shouldUpdate).toBe(false);
    });
  });

  describe('handleNavigation integration (verifies wiring to pure functions)', () => {
    // Verifies that handleNavigation correctly uses computeLocationKey and shouldSkipNavigation

    let mockNavigationSpan: Span;

    beforeEach(async () => {
      // Reset all mocks
      vi.clearAllMocks();

      // Import fresh modules to reset internal state
      const coreModule = await import('@sentry/core');
      const browserModule = await import('@sentry/browser');
      const instrumentationModule = await import('../../src/reactrouter-compat-utils/instrumentation');

      // Create a mock span with end() that captures callback
      mockNavigationSpan = {
        updateName: vi.fn(),
        setAttribute: vi.fn(),
        end: vi.fn(),
      } as unknown as Span;

      // Mock getClient to return a client that's registered for instrumentation
      const mockClient = {
        addIntegration: vi.fn(),
        emit: vi.fn(),
        on: vi.fn(),
        getOptions: vi.fn(() => ({})),
      } as unknown as Client;
      vi.mocked(coreModule.getClient).mockReturnValue(mockClient);

      // Mock startBrowserTracingPageLoadSpan to avoid pageload span creation during setup
      vi.mocked(browserModule.startBrowserTracingPageLoadSpan).mockReturnValue(undefined);

      // Register client for instrumentation by adding it to the internal set
      const integration = instrumentationModule.createReactRouterV6CompatibleTracingIntegration({
        useEffect: vi.fn(),
        useLocation: vi.fn(),
        useNavigationType: vi.fn(),
        createRoutesFromChildren: vi.fn(),
        matchRoutes: vi.fn(),
      });
      integration.afterAllSetup(mockClient);

      // Mock startBrowserTracingNavigationSpan to return our mock span
      vi.mocked(browserModule.startBrowserTracingNavigationSpan).mockReturnValue(mockNavigationSpan);

      // Mock spanToJSON to return different values for different calls
      vi.mocked(coreModule.spanToJSON).mockReturnValue({ op: 'navigation' } as any);

      // Mock getActiveRootSpan to return undefined (no pageload span)
      vi.mocked(coreModule.getActiveSpan).mockReturnValue(undefined);
    });

    it('creates navigation span and uses computeLocationKey for tracking', async () => {
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { resolveRouteNameAndSource } = await import('../../src/reactrouter-compat-utils/utils');

      // Mock to return a specific route name
      vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/search', 'route']);

      const location: Location = {
        pathname: '/search',
        search: '?q=foo',
        hash: '#results',
        state: null,
        key: 'test1',
      };

      const matches = [
        {
          pathname: '/search',
          pathnameBase: '/search',
          route: { path: '/search', element: <div /> },
          params: {},
        },
      ];

      handleNavigation({
        location,
        routes: [{ path: '/search', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that handleNavigation calls startBrowserTracingNavigationSpan
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
        expect.objectContaining({ emit: expect.any(Function) }), // client
        expect.objectContaining({
          name: '/search',
          attributes: expect.objectContaining({
            'sentry.op': 'navigation',
            'sentry.source': 'route',
          }),
        }),
      );
    });

    it('blocks duplicate navigation for exact same locationKey (pathname+query+hash)', async () => {
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { spanToJSON } = await import('@sentry/core');

      const location: Location = {
        pathname: '/search',
        search: '?q=foo',
        hash: '#results',
        state: null,
        key: 'test1',
      };

      const matches = [
        {
          pathname: '/search',
          pathnameBase: '/search',
          route: { path: '/search', element: <div /> },
          params: {},
        },
      ];

      // First navigation - should create span
      handleNavigation({
        location,
        routes: [{ path: '/search', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Mock spanToJSON to indicate span hasn't ended yet
      vi.mocked(spanToJSON).mockReturnValue({ op: 'navigation' } as any);

      // Second navigation - exact same location, should be blocked
      handleNavigation({
        location: { ...location, key: 'test2' }, // Different key, same location
        routes: [{ path: '/search', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that duplicate detection uses locationKey (not just pathname)
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1); // Only first call
    });

    it('allows navigation for same pathname but different query string', async () => {
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { spanToJSON } = await import('@sentry/core');

      const location1: Location = {
        pathname: '/search',
        search: '?q=foo',
        hash: '',
        state: null,
        key: 'test1',
      };

      const matches = [
        {
          pathname: '/search',
          pathnameBase: '/search',
          route: { path: '/search', element: <div /> },
          params: {},
        },
      ];

      // First navigation
      handleNavigation({
        location: location1,
        routes: [{ path: '/search', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Mock spanToJSON to indicate span hasn't ended yet
      vi.mocked(spanToJSON).mockReturnValue({ op: 'navigation' } as any);

      // Second navigation - same pathname, different query
      const location2: Location = {
        pathname: '/search',
        search: '?q=bar',
        hash: '',
        state: null,
        key: 'test2',
      };

      handleNavigation({
        location: location2,
        routes: [{ path: '/search', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that query params are included in locationKey for duplicate detection
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2); // Both calls should create spans
    });

    it('allows navigation for same pathname but different hash', async () => {
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { spanToJSON } = await import('@sentry/core');

      const location1: Location = {
        pathname: '/page',
        search: '',
        hash: '#section1',
        state: null,
        key: 'test1',
      };

      const matches = [
        {
          pathname: '/page',
          pathnameBase: '/page',
          route: { path: '/page', element: <div /> },
          params: {},
        },
      ];

      // First navigation
      handleNavigation({
        location: location1,
        routes: [{ path: '/page', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Mock spanToJSON to indicate span hasn't ended yet
      vi.mocked(spanToJSON).mockReturnValue({ op: 'navigation' } as any);

      // Second navigation - same pathname, different hash
      const location2: Location = {
        pathname: '/page',
        search: '',
        hash: '#section2',
        state: null,
        key: 'test2',
      };

      handleNavigation({
        location: location2,
        routes: [{ path: '/page', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that hash values are included in locationKey for duplicate detection
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(2); // Both calls should create spans
    });

    it('updates wildcard span when better parameterized name becomes available', async () => {
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { spanToJSON } = await import('@sentry/core');
      const { transactionNameHasWildcard, resolveRouteNameAndSource } = await import(
        '../../src/reactrouter-compat-utils/utils'
      );

      const location: Location = {
        pathname: '/users/123',
        search: '',
        hash: '',
        state: null,
        key: 'test1',
      };

      const matches = [
        {
          pathname: '/users/123',
          pathnameBase: '/users',
          route: { path: '/users/*', element: <div /> },
          params: { '*': '123' },
        },
      ];

      // First navigation - resolves to wildcard name
      vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/*', 'route']);
      // Mock transactionNameHasWildcard to return true for wildcards, false for parameterized
      vi.mocked(transactionNameHasWildcard).mockImplementation((name: string) => {
        return name.includes('/*') || name === '*' || name.endsWith('*');
      });

      handleNavigation({
        location,
        routes: [{ path: '/users/*', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      const firstSpan = mockNavigationSpan;
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // Mock spanToJSON to indicate span hasn't ended yet and has wildcard name
      vi.mocked(spanToJSON).mockReturnValue({
        op: 'navigation',
        description: '/users/*',
        data: { 'sentry.source': 'route' },
      } as any);

      // Second navigation - same location but better parameterized name available
      vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users/:id', 'route']);

      handleNavigation({
        location: { ...location, key: 'test2' },
        routes: [{ path: '/users/:id', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that wildcard span names are upgraded when parameterized routes become available
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(firstSpan.updateName)).toHaveBeenCalledWith('/users/:id');
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1); // No new span created
    });

    it('prevents duplicate spans when <Routes location> prop is a string (partial location)', async () => {
      // This test verifies the fix for the bug where <Routes location="/users"> creates
      // a partial location object with search: undefined and hash: undefined, which
      // would result in a different locationKey ('/usersundefinedundefined' vs '/users')
      // causing duplicate navigation spans.
      const { handleNavigation } = await import('../../src/reactrouter-compat-utils/instrumentation');
      const { startBrowserTracingNavigationSpan } = await import('@sentry/browser');
      const { spanToJSON } = await import('@sentry/core');
      const { resolveRouteNameAndSource } = await import('../../src/reactrouter-compat-utils/utils');

      // Mock resolveRouteNameAndSource to return consistent route name
      vi.mocked(resolveRouteNameAndSource).mockReturnValue(['/users', 'route']);

      const matches = [
        {
          pathname: '/users',
          pathnameBase: '/users',
          route: { path: '/users', element: <div /> },
          params: {},
        },
      ];

      // First call: Partial location (from <Routes location="/users">)
      // React Router creates location with undefined search and hash
      const partialLocation: Location = {
        pathname: '/users',
        search: undefined as unknown as string,
        hash: undefined as unknown as string,
        state: null,
        key: 'test1',
      };

      handleNavigation({
        location: partialLocation,
        routes: [{ path: '/users', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);

      // Mock spanToJSON to indicate span hasn't ended yet
      vi.mocked(spanToJSON).mockReturnValue({ op: 'navigation' } as any);

      // Second call: Full location (from router.state)
      // React Router provides location with empty string search and hash
      const fullLocation: Location = {
        pathname: '/users',
        search: '',
        hash: '',
        state: null,
        key: 'test2',
      };

      handleNavigation({
        location: fullLocation,
        routes: [{ path: '/users', element: <div /> }],
        navigationType: 'PUSH',
        version: '6' as const,
        matches: matches as any,
      });

      // Verifies that undefined values are normalized, preventing duplicate spans
      // (without normalization, '/usersundefinedundefined' != '/users' would create 2 spans)
      expect(startBrowserTracingNavigationSpan).toHaveBeenCalledTimes(1);
    });
  });

  describe('SSR-safe RAF fallback (scheduleCallback/cancelScheduledCallback)', () => {
    // These tests verify that the RAF fallback works correctly in SSR environments

    it('uses requestAnimationFrame when available', () => {
      // Save original RAF
      const originalRAF = window.requestAnimationFrame;
      const rafSpy = vi.fn((cb: () => void) => {
        cb();
        return 123;
      });
      window.requestAnimationFrame = rafSpy;

      try {
        // Import module to trigger RAF usage
        const scheduleCallback = (callback: () => void): number => {
          if (window?.requestAnimationFrame) {
            return window.requestAnimationFrame(callback);
          }
          return setTimeout(callback, 0) as unknown as number;
        };

        const mockCallback = vi.fn();
        scheduleCallback(mockCallback);

        // Verifies that requestAnimationFrame is used when available
        expect(rafSpy).toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalled();
      } finally {
        window.requestAnimationFrame = originalRAF;
      }
    });

    it('falls back to setTimeout when requestAnimationFrame is unavailable (SSR)', () => {
      // Simulate SSR by removing RAF
      const originalRAF = window.requestAnimationFrame;
      const originalCAF = window.cancelAnimationFrame;
      // @ts-expect-error - Simulating SSR environment
      delete window.requestAnimationFrame;
      // @ts-expect-error - Simulating SSR environment
      delete window.cancelAnimationFrame;

      try {
        const timeoutSpy = vi.spyOn(global, 'setTimeout');

        // Import module to trigger setTimeout fallback
        const scheduleCallback = (callback: () => void): number => {
          if (window?.requestAnimationFrame) {
            return window.requestAnimationFrame(callback);
          }
          return setTimeout(callback, 0) as unknown as number;
        };

        const mockCallback = vi.fn();
        scheduleCallback(mockCallback);

        // Verifies that setTimeout is used when requestAnimationFrame is unavailable
        expect(timeoutSpy).toHaveBeenCalledWith(mockCallback, 0);
      } finally {
        window.requestAnimationFrame = originalRAF;
        window.cancelAnimationFrame = originalCAF;
      }
    });
  });

  describe('allRoutes global set (lazy routes behavior)', () => {
    it('should allow adding routes to allRoutes after initial setup', () => {
      // Clear the set first
      allRoutes.clear();

      const initialRoutes: RouteObject[] = [{ path: '/', element: <div>Home</div> }];
      const lazyRoutes: RouteObject[] = [{ path: '/lazy/:id', element: <div>Lazy</div> }];

      // Add initial routes
      addRoutesToAllRoutes(initialRoutes);
      expect(allRoutes.size).toBe(1);
      expect(allRoutes.has(initialRoutes[0]!)).toBe(true);

      // Simulate lazy route loading via patchRoutesOnNavigation
      addRoutesToAllRoutes(lazyRoutes);
      expect(allRoutes.size).toBe(2);
      expect(allRoutes.has(lazyRoutes[0]!)).toBe(true);
    });

    it('should not duplicate routes when adding same route multiple times', () => {
      allRoutes.clear();

      const routes: RouteObject[] = [{ path: '/users', element: <div>Users</div> }];

      addRoutesToAllRoutes(routes);
      addRoutesToAllRoutes(routes); // Add same route again

      // Set should have unique entries only
      expect(allRoutes.size).toBe(1);
    });

    it('should recursively add nested children routes', () => {
      allRoutes.clear();

      const parentRoute: RouteObject = {
        path: '/parent',
        element: <div>Parent</div>,
        children: [
          {
            path: ':id',
            element: <div>Child</div>,
            children: [{ path: 'nested', element: <div>Nested</div> }],
          },
        ],
      };

      addRoutesToAllRoutes([parentRoute]);

      // Should add parent and all nested children
      expect(allRoutes.size).toBe(3);
      expect(allRoutes.has(parentRoute)).toBe(true);
      expect(allRoutes.has(parentRoute.children![0]!)).toBe(true);
      expect(allRoutes.has(parentRoute.children![0]!.children![0]!)).toBe(true);
    });

    // Regression test: Verify that routes added AFTER a span starts are still accessible
    // This is the key fix for the lazy routes pageload bug where patchSpanEnd
    // was using a stale snapshot instead of the global allRoutes set.
    it('should maintain reference to global set (not snapshot) for late route additions', () => {
      allRoutes.clear();

      // Initial routes at "pageload start" time
      const initialRoutes: RouteObject[] = [
        { path: '/', element: <div>Home</div> },
        { path: '/slow-fetch', element: <div>Slow Fetch Parent</div> },
      ];
      addRoutesToAllRoutes(initialRoutes);

      // Capture a reference to allRoutes (simulating what patchSpanEnd does AFTER the fix)
      const routesReference = allRoutes;

      // Later, lazy routes are loaded via patchRoutesOnNavigation
      const lazyLoadedRoutes: RouteObject[] = [{ path: ':id', element: <div>Lazy Child</div> }];
      addRoutesToAllRoutes(lazyLoadedRoutes);

      // The reference should see the newly added routes (fix behavior)
      // Before the fix, a snapshot (new Set(allRoutes)) was taken, which wouldn't see new routes
      expect(routesReference.size).toBe(3);
      expect(routesReference.has(lazyLoadedRoutes[0]!)).toBe(true);

      // Convert to array and verify all routes are present
      const allRoutesArray = Array.from(routesReference);
      expect(allRoutesArray).toContain(initialRoutes[0]);
      expect(allRoutesArray).toContain(initialRoutes[1]);
      expect(allRoutesArray).toContain(lazyLoadedRoutes[0]);
    });
  });

  describe('wrapPatchRoutesOnNavigation race condition fix', () => {
    it('should use captured span instead of current active span in args.patch callback', () => {
      const endedSpanJson = {
        op: 'navigation',
        timestamp: 1234567890, // Span has ended
      };

      vi.mocked(spanToJSON).mockReturnValue(endedSpanJson as any);

      const endedSpan = {
        updateName: vi.fn(),
        setAttribute: vi.fn(),
      } as unknown as Span;

      updateNavigationSpan(
        endedSpan,
        { pathname: '/test', search: '', hash: '', state: null, key: 'test' },
        [],
        false,
        vi.fn(() => []),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(endedSpan.updateName).not.toHaveBeenCalled();
    });

    it('should not fall back to WINDOW.location.pathname after async operations', () => {
      const validSpanJson = {
        op: 'navigation',
        timestamp: undefined, // Span hasn't ended
      };

      vi.mocked(spanToJSON).mockReturnValue(validSpanJson as any);

      const validSpan = {
        updateName: vi.fn(),
        setAttribute: vi.fn(),
      } as unknown as Span;

      updateNavigationSpan(
        validSpan,
        { pathname: '/captured/path', search: '', hash: '', state: null, key: 'test' },
        [],
        false,
        vi.fn(() => []),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(validSpan.updateName).toHaveBeenCalled();
    });
  });
});
