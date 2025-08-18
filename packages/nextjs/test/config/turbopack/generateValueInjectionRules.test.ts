import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { RouteManifest } from '../../../src/config/manifest/types';
import { generateValueInjectionRules } from '../../../src/config/turbopack/generateValueInjectionRules';

// Mock path.resolve to return a predictable loader path
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    resolve: vi.fn().mockReturnValue('/mocked/path/to/valueInjectionLoader.js'),
  };
});

describe('generateValueInjectionRules', () => {
  const mockRouteManifest: RouteManifest = {
    dynamicRoutes: [{ path: '/users/[id]', regex: '/users/([^/]+)', paramNames: ['id'] }],
    staticRoutes: [
      { path: '/users', regex: '/users' },
      { path: '/api/health', regex: '/api/health' },
    ],
  };

  describe('with no inputs', () => {
    it('should return empty array when no inputs are provided', () => {
      const result = generateValueInjectionRules({});

      expect(result).toEqual([]);
    });

    it('should return empty array when inputs are undefined', () => {
      const result = generateValueInjectionRules({
        routeManifest: undefined,
        nextJsVersion: undefined,
      });

      expect(result).toEqual([]);
    });
  });

  describe('with nextJsVersion only', () => {
    it('should generate client and server rules when nextJsVersion is provided', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
      });

      expect(result).toHaveLength(2);

      // Client rule
      const clientRule = result.find(rule => rule.matcher === '**/instrumentation-client.*');
      expect(clientRule).toBeDefined();
      expect(clientRule?.rule).toEqual({
        loaders: [
          {
            loader: '/mocked/path/to/valueInjectionLoader.js',
            options: {
              values: {
                _sentryNextJsVersion: '14.0.0',
              },
            },
          },
        ],
      });

      // Server rule
      const serverRule = result.find(rule => rule.matcher === '**/instrumentation.*');
      expect(serverRule).toBeDefined();
      expect(serverRule?.rule).toEqual({
        loaders: [
          {
            loader: '/mocked/path/to/valueInjectionLoader.js',
            options: {
              values: {
                _sentryNextJsVersion: '14.0.0',
              },
            },
          },
        ],
      });
    });
  });

  describe('with routeManifest only', () => {
    it('should generate only client rule when routeManifest is provided', () => {
      const result = generateValueInjectionRules({
        routeManifest: mockRouteManifest,
      });

      expect(result).toHaveLength(1);

      // Only client rule should exist
      const clientRule = result.find(rule => rule.matcher === '**/instrumentation-client.*');
      expect(clientRule).toBeDefined();
      expect(clientRule?.rule).toEqual({
        loaders: [
          {
            loader: '/mocked/path/to/valueInjectionLoader.js',
            options: {
              values: {
                _sentryRouteManifest: JSON.stringify(mockRouteManifest),
              },
            },
          },
        ],
      });

      // Server rule should not exist
      const serverRule = result.find(rule => rule.matcher === '**/instrumentation.*');
      expect(serverRule).toBeUndefined();
    });

    it('should handle empty route manifest', () => {
      const emptyManifest: RouteManifest = {
        dynamicRoutes: [],
        staticRoutes: [],
      };

      const result = generateValueInjectionRules({
        routeManifest: emptyManifest,
      });

      expect(result).toHaveLength(1);

      const clientRule = result.find(rule => rule.matcher === '**/instrumentation-client.*');
      expect(clientRule?.rule).toMatchObject({
        loaders: [
          {
            options: {
              values: {
                _sentryRouteManifest: JSON.stringify(emptyManifest),
              },
            },
          },
        ],
      });
    });

    it('should handle complex route manifest', () => {
      const complexManifest: RouteManifest = {
        dynamicRoutes: [
          { path: '/users/[id]', regex: '/users/([^/]+)', paramNames: ['id'] },
          { path: '/posts/[...slug]', regex: '/posts/(.*)', paramNames: ['slug'] },
          { path: '/category/[category]/[id]', regex: '/category/([^/]+)/([^/]+)', paramNames: ['category', 'id'] },
        ],
        staticRoutes: [
          { path: '/', regex: '/' },
          { path: '/about', regex: '/about' },
          { path: '/api/health', regex: '/api/health' },
          { path: '/api/users', regex: '/api/users' },
        ],
      };

      const result = generateValueInjectionRules({
        routeManifest: complexManifest,
      });

      expect(result).toHaveLength(1);

      const clientRule = result.find(rule => rule.matcher === '**/instrumentation-client.*');
      expect(clientRule?.rule).toMatchObject({
        loaders: [
          {
            options: {
              values: {
                _sentryRouteManifest: JSON.stringify(complexManifest),
              },
            },
          },
        ],
      });
    });
  });

  describe('with both nextJsVersion and routeManifest', () => {
    it('should generate both client and server rules with combined values', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
        routeManifest: mockRouteManifest,
      });

      expect(result).toHaveLength(2);

      // Client rule should have both values
      const clientRule = result.find(rule => rule.matcher === '**/instrumentation-client.*');
      expect(clientRule).toBeDefined();
      expect(clientRule?.rule).toEqual({
        loaders: [
          {
            loader: '/mocked/path/to/valueInjectionLoader.js',
            options: {
              values: {
                _sentryNextJsVersion: '14.0.0',
                _sentryRouteManifest: JSON.stringify(mockRouteManifest),
              },
            },
          },
        ],
      });

      // Server rule should have only nextJsVersion
      const serverRule = result.find(rule => rule.matcher === '**/instrumentation.*');
      expect(serverRule).toBeDefined();
      expect(serverRule?.rule).toEqual({
        loaders: [
          {
            loader: '/mocked/path/to/valueInjectionLoader.js',
            options: {
              values: {
                _sentryNextJsVersion: '14.0.0',
              },
            },
          },
        ],
      });
    });

    it('should handle all combinations of truthy and falsy values', () => {
      const testCases = [
        { nextJsVersion: '14.0.0', routeManifest: mockRouteManifest, expectedRules: 2 },
        { nextJsVersion: '', routeManifest: mockRouteManifest, expectedRules: 1 },
        { nextJsVersion: '14.0.0', routeManifest: undefined, expectedRules: 2 },
        { nextJsVersion: '', routeManifest: undefined, expectedRules: 0 },
      ];

      testCases.forEach(({ nextJsVersion, routeManifest, expectedRules }) => {
        const result = generateValueInjectionRules({
          nextJsVersion: nextJsVersion || undefined,
          routeManifest,
        });

        expect(result).toHaveLength(expectedRules);
      });
    });
  });

  describe('path resolution', () => {
    it('should call path.resolve with correct arguments', () => {
      const pathResolveSpy = vi.spyOn(path, 'resolve');

      generateValueInjectionRules({
        nextJsVersion: '14.0.0',
      });

      expect(pathResolveSpy).toHaveBeenCalledWith(expect.any(String), '..', 'loaders', 'valueInjectionLoader.js');
    });

    it('should use the resolved path in loader configuration', () => {
      const customLoaderPath = '/custom/path/to/loader.js';
      const pathResolveSpy = vi.spyOn(path, 'resolve');
      pathResolveSpy.mockReturnValue(customLoaderPath);

      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
      });

      expect(result).toHaveLength(2);

      result.forEach(rule => {
        const ruleWithLoaders = rule.rule as unknown as { loaders: Array<{ loader: string }> };
        expect(ruleWithLoaders.loaders[0]?.loader).toBe(customLoaderPath);
      });
    });
  });

  describe('rule structure validation', () => {
    it('should generate rules with correct structure', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
        routeManifest: mockRouteManifest,
      });

      result.forEach(rule => {
        // Validate top-level structure
        expect(rule).toHaveProperty('matcher');
        expect(rule).toHaveProperty('rule');
        expect(typeof rule.matcher).toBe('string');

        // Validate rule structure
        const ruleObj = rule.rule as unknown as { loaders: Array<any> };
        expect(ruleObj).toHaveProperty('loaders');
        expect(Array.isArray(ruleObj.loaders)).toBe(true);
        expect(ruleObj.loaders).toHaveLength(1);

        // Validate loader structure
        const loader = ruleObj.loaders[0];
        expect(loader).toHaveProperty('loader');
        expect(loader).toHaveProperty('options');
        expect(typeof loader.loader).toBe('string');
        expect(loader.options).toHaveProperty('values');
        expect(typeof loader.options.values).toBe('object');
      });
    });

    it('should generate different matchers for client and server rules', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
      });

      const matchers = result.map(rule => rule.matcher);
      expect(matchers).toContain('**/instrumentation-client.*');
      expect(matchers).toContain('**/instrumentation.*');
      expect(matchers).toHaveLength(2);
    });

    it('should ensure client rules come before server rules', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '14.0.0',
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.matcher).toBe('**/instrumentation-client.*');
      expect(result[1]?.matcher).toBe('**/instrumentation.*');
    });
  });

  describe('edge cases', () => {
    it('should handle zero-length nextJsVersion', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '',
      });

      expect(result).toEqual([]);
    });

    it('should handle whitespace-only nextJsVersion', () => {
      const result = generateValueInjectionRules({
        nextJsVersion: '   ',
      });

      expect(result).toHaveLength(2);

      result.forEach(rule => {
        const ruleObj = rule.rule as unknown as { loaders: Array<{ options: { values: any } }> };
        expect(ruleObj.loaders[0]?.options.values._sentryNextJsVersion).toBe('   ');
      });
    });
  });
});
