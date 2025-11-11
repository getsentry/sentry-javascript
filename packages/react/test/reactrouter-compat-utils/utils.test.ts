import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getNormalizedName,
  getNumberOfUrlSegments,
  initializeRouterUtils,
  locationIsInsideDescendantRoute,
  pathEndsWithWildcard,
  pathIsWildcardAndHasChildren,
  prefixWithSlash,
  rebuildRoutePathFromAllRoutes,
  resolveRouteNameAndSource,
  transactionNameHasWildcard,
} from '../../src/reactrouter-compat-utils';
import type { Location, MatchRoutes, RouteMatch, RouteObject } from '../../src/types';

vi.mock('@sentry/browser', async requireActual => {
  const actual = await requireActual();
  return {
    ...(actual as any),
    WINDOW: {
      location: {
        pathname: '/test/path',
        search: '?query=1',
        hash: '#section',
        href: 'https://example.com/test/path?query=1#section',
      },
    },
  };
});

const mockMatchRoutes = vi.fn();

describe('reactrouter-compat-utils/utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeRouterUtils(mockMatchRoutes as MatchRoutes, false);
  });

  describe('initializeRouterUtils', () => {
    it('should initialize with matchRoutes function', () => {
      expect(() => {
        initializeRouterUtils(mockMatchRoutes as MatchRoutes, false);
      }).not.toThrow();
    });

    it('should handle custom matchRoutes function with dev mode true', () => {
      const customMatchRoutes = vi.fn();
      expect(() => {
        initializeRouterUtils(customMatchRoutes as MatchRoutes, true);
      }).not.toThrow();
    });

    it('should handle custom matchRoutes function without dev mode flag', () => {
      const customMatchRoutes = vi.fn();
      expect(() => {
        initializeRouterUtils(customMatchRoutes as MatchRoutes);
      }).not.toThrow();
    });
  });

  describe('prefixWithSlash', () => {
    it('should add slash to string without leading slash', () => {
      expect(prefixWithSlash('path')).toBe('/path');
    });

    it('should not add slash to string with leading slash', () => {
      expect(prefixWithSlash('/path')).toBe('/path');
    });

    it('should handle empty string', () => {
      expect(prefixWithSlash('')).toBe('/');
    });
  });

  describe('pathEndsWithWildcard', () => {
    it('should return true for path ending with /*', () => {
      expect(pathEndsWithWildcard('/users/*')).toBe(true);
    });

    it('should return false for path not ending with /*', () => {
      expect(pathEndsWithWildcard('/users')).toBe(false);
    });

    it('should return true for path ending with *', () => {
      expect(pathEndsWithWildcard('/users*')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(pathEndsWithWildcard('')).toBe(false);
    });
  });

  describe('pathIsWildcardAndHasChildren', () => {
    it('should return true for wildcard path with children', () => {
      const branch = {
        route: {
          path: '/users/*',
          children: [{ path: 'profile' }],
        },
        params: {},
        pathname: '/users',
        pathnameBase: '/users',
      } as RouteMatch<string>;

      expect(pathIsWildcardAndHasChildren('/users/*', branch)).toBe(true);
    });

    it('should return false for wildcard path without children', () => {
      const branch = {
        route: {
          path: '/users/*',
          children: [],
        },
        params: {},
        pathname: '/users',
        pathnameBase: '/users',
      } as RouteMatch<string>;

      expect(pathIsWildcardAndHasChildren('/users/*', branch)).toBe(false);
    });

    it('should return false for non-wildcard path with children', () => {
      const branch = {
        route: {
          path: '/users',
          children: [{ path: 'profile' }],
        },
        params: {},
        pathname: '/users',
        pathnameBase: '/users',
      } as RouteMatch<string>;

      expect(pathIsWildcardAndHasChildren('/users', branch)).toBe(false);
    });

    it('should return false for non-wildcard path without children', () => {
      const branch = {
        route: {
          path: '/users',
        },
        params: {},
        pathname: '/users',
        pathnameBase: '/users',
      } as RouteMatch<string>;

      expect(pathIsWildcardAndHasChildren('/users', branch)).toBe(false);
    });

    it('should return false when route has undefined children', () => {
      const branch = {
        route: {
          path: '/users/*',
          children: undefined,
        },
        params: {},
        pathname: '/users',
        pathnameBase: '/users',
      } as RouteMatch<string>;

      expect(pathIsWildcardAndHasChildren('/users/*', branch)).toBe(false);
    });
  });

  describe('getNumberOfUrlSegments', () => {
    it('should count URL segments correctly', () => {
      expect(getNumberOfUrlSegments('/users/123/profile')).toBe(3);
    });

    it('should handle single segment', () => {
      expect(getNumberOfUrlSegments('/users')).toBe(1);
    });

    it('should handle root path', () => {
      expect(getNumberOfUrlSegments('/')).toBe(0);
    });

    it('should handle empty string', () => {
      expect(getNumberOfUrlSegments('')).toBe(0);
    });

    it('should handle regex URLs with escaped slashes', () => {
      expect(getNumberOfUrlSegments('/users\\/profile')).toBe(2);
    });

    it('should filter out empty segments and commas', () => {
      expect(getNumberOfUrlSegments('/users//profile,test')).toBe(2);
    });
  });

  describe('rebuildRoutePathFromAllRoutes', () => {
    it('should return pathname when it matches stripped path', () => {
      const allRoutes: RouteObject[] = [{ path: '/users', element: null }];

      const location: Location = { pathname: '/users' };

      const mockMatches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = rebuildRoutePathFromAllRoutes(allRoutes, location);
      expect(result).toBe('/users');
    });

    it('should return empty string when no routes match', () => {
      const allRoutes: RouteObject[] = [{ path: '/users', element: null }];

      const location: Location = { pathname: '/nonexistent' };

      mockMatchRoutes.mockReturnValue([]);

      const result = rebuildRoutePathFromAllRoutes(allRoutes, location);
      expect(result).toBe('');
    });

    it('should return empty string when no matches found', () => {
      const allRoutes: RouteObject[] = [{ path: '/users', element: null }];

      const location: Location = { pathname: '/users' };

      mockMatchRoutes.mockReturnValue(null);

      const result = rebuildRoutePathFromAllRoutes(allRoutes, location);
      expect(result).toBe('');
    });

    it('should handle wildcard routes', () => {
      const allRoutes: RouteObject[] = [{ path: '/users/*', element: null }];

      const location: Location = { pathname: '/users/anything' };

      const mockMatches: RouteMatch[] = [
        {
          route: { path: '*', element: null },
          params: { '*': 'anything' },
          pathname: '/users/anything',
          pathnameBase: '/users',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = rebuildRoutePathFromAllRoutes(allRoutes, location);
      expect(result).toBe('');
    });
  });

  describe('locationIsInsideDescendantRoute', () => {
    it('should return true when location is inside descendant route', () => {
      const routes: RouteObject[] = [
        {
          path: '/users/*',
          element: 'div',
          children: undefined,
        },
      ];

      const location: Location = { pathname: '/users/123/profile' };

      const mockMatches: RouteMatch[] = [
        {
          route: {
            path: '/users/*',
            element: 'div',
            children: undefined,
          },
          params: { '*': '123/profile' },
          pathname: '/users/123/profile',
          pathnameBase: '/users',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(true);
    });

    it('should return false when route has children (not descendant)', () => {
      const routes: RouteObject[] = [
        {
          path: '/users/*',
          element: 'div',
          children: [{ path: 'profile' }],
        },
      ];

      const location: Location = { pathname: '/users/123/profile' };

      const mockMatches: RouteMatch[] = [
        {
          route: {
            path: '/users/*',
            element: 'div',
            children: [{ path: 'profile' }],
          },
          params: { '*': '123/profile' },
          pathname: '/users/123/profile',
          pathnameBase: '/users',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(false);
    });

    it('should return false when route has no element', () => {
      const routes: RouteObject[] = [
        {
          path: '/users/*',
          element: null,
          children: undefined,
        },
      ];

      const location: Location = { pathname: '/users/123/profile' };

      const mockMatches: RouteMatch[] = [
        {
          route: {
            path: '/users/*',
            element: null,
            children: undefined,
          },
          params: { '*': '123/profile' },
          pathname: '/users/123/profile',
          pathnameBase: '/users',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(false);
    });

    it('should return false when path does not end with /*', () => {
      const routes: RouteObject[] = [
        {
          path: '/users',
          element: 'div',
          children: undefined,
        },
      ];

      const location: Location = { pathname: '/users' };

      const mockMatches: RouteMatch[] = [
        {
          route: {
            path: '/users',
            element: 'div',
            children: undefined,
          },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(false);
    });

    it('should return false when no splat parameter', () => {
      const routes: RouteObject[] = [
        {
          path: '/users/*',
          element: 'div',
          children: undefined,
        },
      ];

      const location: Location = { pathname: '/users' };

      const mockMatches: RouteMatch[] = [
        {
          route: {
            path: '/users/*',
            element: 'div',
            children: undefined,
          },
          params: {},
          pathname: '/users',
          pathnameBase: '/users',
        },
      ];

      mockMatchRoutes.mockReturnValue(mockMatches);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(false);
    });

    it('should return false when no matches found', () => {
      const routes: RouteObject[] = [{ path: '/users', element: null }];

      const location: Location = { pathname: '/posts' };

      mockMatchRoutes.mockReturnValue(null);

      const result = locationIsInsideDescendantRoute(location, routes);
      expect(result).toBe(false);
    });
  });

  describe('getNormalizedName', () => {
    it('should return pathname with url source when no routes provided', () => {
      const routes: RouteObject[] = [];
      const location: Location = { pathname: '/test' };
      const branches: RouteMatch[] = [];

      const result = getNormalizedName(routes, location, branches);
      expect(result).toEqual(['/test', 'url']);
    });

    it('should handle index route', () => {
      const routes: RouteObject[] = [{ path: '/', index: true, element: null }];
      const location: Location = { pathname: '/' };
      const branches: RouteMatch[] = [
        {
          route: { path: '/', index: true, element: null },
          params: {},
          pathname: '/',
          pathnameBase: '',
        },
      ];

      const result = getNormalizedName(routes, location, branches, '');
      expect(result).toEqual(['/', 'route']);
    });

    it('should handle simple route path', () => {
      const routes: RouteObject[] = [{ path: '/users', element: null }];
      const location: Location = { pathname: '/users' };
      const branches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      const result = getNormalizedName(routes, location, branches, '');
      expect(result).toEqual(['/users', 'route']);
    });

    it('should handle nested routes', () => {
      const routes: RouteObject[] = [
        { path: '/users', element: null },
        { path: ':userId', element: null },
      ];
      const location: Location = { pathname: '/users/123' };
      const branches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
        {
          route: { path: ':userId', element: null },
          params: { userId: '123' },
          pathname: '/users/123',
          pathnameBase: '/users',
        },
      ];

      const result = getNormalizedName(routes, location, branches, '');
      expect(result).toEqual(['/users/:userId', 'route']);
    });

    it('should handle wildcard routes with children', () => {
      const routes: RouteObject[] = [
        {
          path: '/users/*',
          element: null,
          children: [{ path: 'profile', element: null }],
        },
      ];
      const location: Location = { pathname: '/users/profile' };
      const branches: RouteMatch[] = [
        {
          route: {
            path: '/users/*',
            element: null,
            children: [{ path: 'profile', element: null }],
          },
          params: { '*': 'profile' },
          pathname: '/users/profile',
          pathnameBase: '/users',
        },
      ];

      const result = getNormalizedName(routes, location, branches, '');
      // Function falls back to url when wildcard path with children doesn't match exact logic
      expect(result).toEqual(['/users/profile', 'url']);
    });

    it('should handle basename stripping', () => {
      // Initialize with stripBasename = true
      initializeRouterUtils(mockMatchRoutes as MatchRoutes, true);

      const routes: RouteObject[] = [{ path: '/users', element: null }];
      const location: Location = { pathname: '/app/users' };
      const branches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/app/users',
          pathnameBase: '/app',
        },
      ];

      const result = getNormalizedName(routes, location, branches, '/app');
      // Function falls back to url when basename stripping doesn't match exact logic
      expect(result).toEqual(['/users', 'url']);
    });

    it('should fallback to pathname when no matches', () => {
      const routes: RouteObject[] = [{ path: '/users', element: null }];
      const location: Location = { pathname: '/posts' };
      const branches: RouteMatch[] = [];

      const result = getNormalizedName(routes, location, branches, '');
      expect(result).toEqual(['/posts', 'url']);
    });
  });

  describe('resolveRouteNameAndSource', () => {
    beforeEach(() => {
      // Reset to default stripBasename = false
      initializeRouterUtils(mockMatchRoutes as MatchRoutes, false);
    });

    it('should use descendant route when location is inside one', () => {
      const location: Location = { pathname: '/users/123/profile' };
      const routes: RouteObject[] = [{ path: '/users', element: null }];
      const allRoutes: RouteObject[] = [
        { path: '/users/*', element: 'div' }, // element must be truthy for descendant route
        { path: '/users', element: null },
      ];
      const branches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      // Mock for descendant route check
      const descendantMatches: RouteMatch[] = [
        {
          route: { path: '/users/*', element: 'div' },
          params: { '*': '123/profile' },
          pathname: '/users/123/profile',
          pathnameBase: '/users',
        },
      ];

      // Mock for rebuild route path - should return '/users'
      const rebuildMatches: RouteMatch[] = [
        {
          route: { path: '/users/*', element: 'div' },
          params: { '*': '123/profile' },
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      mockMatchRoutes
        .mockReturnValueOnce(descendantMatches) // First call for descendant check
        .mockReturnValueOnce(rebuildMatches); // Second call for path rebuild

      const result = resolveRouteNameAndSource(location, routes, allRoutes, branches, '');
      // Since locationIsInsideDescendantRoute returns true, it uses route source
      expect(result).toEqual(['/users/123/profile', 'route']);
    });

    it('should use normalized name when not in descendant route', () => {
      const location: Location = { pathname: '/users' };
      const routes: RouteObject[] = [{ path: '/users', element: null }];
      const allRoutes: RouteObject[] = [{ path: '/users', element: null }];
      const branches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      // Mock for descendant route check (no descendant)
      const normalMatches: RouteMatch[] = [
        {
          route: { path: '/users', element: null },
          params: {},
          pathname: '/users',
          pathnameBase: '',
        },
      ];

      mockMatchRoutes.mockReturnValue(normalMatches);

      const result = resolveRouteNameAndSource(location, routes, allRoutes, branches, '');
      expect(result).toEqual(['/users', 'route']);
    });

    it('should fallback to pathname when no name resolved', () => {
      const location: Location = { pathname: '/unknown' };
      const routes: RouteObject[] = [];
      const allRoutes: RouteObject[] = [];
      const branches: RouteMatch[] = [];

      mockMatchRoutes.mockReturnValue(null);

      const result = resolveRouteNameAndSource(location, routes, allRoutes, branches, '');
      expect(result).toEqual(['/unknown', 'url']);
    });
  });

  describe('transactionNameHasWildcard', () => {
    it('should detect wildcard at the end of path', () => {
      expect(transactionNameHasWildcard('/lazy/*')).toBe(true);
      expect(transactionNameHasWildcard('/users/:id/*')).toBe(true);
      expect(transactionNameHasWildcard('/products/:category/*')).toBe(true);
    });

    it('should detect standalone wildcard', () => {
      expect(transactionNameHasWildcard('*')).toBe(true);
    });

    it('should detect wildcard in the middle of path', () => {
      expect(transactionNameHasWildcard('/lazy/*/nested')).toBe(true);
      expect(transactionNameHasWildcard('/a/*/b/*/c')).toBe(true);
    });

    it('should not detect wildcards in parameterized routes', () => {
      expect(transactionNameHasWildcard('/users/:id')).toBe(false);
      expect(transactionNameHasWildcard('/products/:category/:id')).toBe(false);
      expect(transactionNameHasWildcard('/items/:itemId/details')).toBe(false);
    });

    it('should not detect wildcards in static routes', () => {
      expect(transactionNameHasWildcard('/')).toBe(false);
      expect(transactionNameHasWildcard('/about')).toBe(false);
      expect(transactionNameHasWildcard('/users/profile')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(transactionNameHasWildcard('')).toBe(false);
      expect(transactionNameHasWildcard('/path/to/asterisk')).toBe(false); // 'asterisk' contains 'isk' but not '*'
    });
  });
});
