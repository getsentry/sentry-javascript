import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { RouteManifest } from '../../../src/config/manifest/types';
import {
  constructTurbopackConfig,
  safelyAddTurbopackRule,
} from '../../../src/config/turbopack/constructTurbopackConfig';
import type { NextConfigObject } from '../../../src/config/types';

// Mock path.resolve to return a predictable loader path
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    resolve: vi.fn().mockReturnValue('/mocked/path/to/valueInjectionLoader.js'),
  };
});

describe('constructTurbopackConfig', () => {
  const mockRouteManifest: RouteManifest = {
    dynamicRoutes: [{ path: '/users/[id]', regex: '/users/([^/]+)', paramNames: ['id'] }],
    staticRoutes: [
      { path: '/users', regex: '/users' },
      { path: '/api/health', regex: '/api/health' },
    ],
  };

  const mockSentryOptions = {};

  describe('without existing turbopack config', () => {
    it('should create a basic turbopack config when no manifest is provided', () => {
      const userNextConfig: NextConfigObject = {};

      const result = constructTurbopackConfig({
        userNextConfig,
        userSentryOptions: mockSentryOptions,
      });

      expect(result).toEqual({});
    });

    it('should create turbopack config with instrumentation rule when manifest is provided', () => {
      const userNextConfig: NextConfigObject = {};

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
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
          },
        },
      });
    });

    it('should call path.resolve with correct arguments', () => {
      const userNextConfig: NextConfigObject = {};
      const pathResolveSpy = vi.spyOn(path, 'resolve');

      constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(pathResolveSpy).toHaveBeenCalledWith(expect.any(String), '..', 'loaders', 'valueInjectionLoader.js');
    });

    it('should handle Windows-style paths correctly', () => {
      // Mock path.resolve to return a Windows-style path
      const windowsLoaderPath = 'C:\\my\\project\\dist\\config\\loaders\\valueInjectionLoader.js';
      const pathResolveSpy = vi.spyOn(path, 'resolve');
      pathResolveSpy.mockReturnValue(windowsLoaderPath);

      const userNextConfig: NextConfigObject = {};

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result.rules).toBeDefined();
      expect(result.rules!['**/instrumentation-client.*']).toBeDefined();

      const rule = result.rules!['**/instrumentation-client.*'];
      expect(rule).toHaveProperty('loaders');

      const ruleWithLoaders = rule as { loaders: Array<{ loader: string; options: any }> };
      expect(ruleWithLoaders.loaders).toBeDefined();
      expect(ruleWithLoaders.loaders).toHaveLength(1);

      const loader = ruleWithLoaders.loaders[0]!;
      expect(loader).toHaveProperty('loader');
      expect(loader).toHaveProperty('options');
      expect(loader.options).toHaveProperty('values');
      expect(loader.options.values).toHaveProperty('_sentryRouteManifest');
      expect(loader.loader).toBe(windowsLoaderPath);
      expect(pathResolveSpy).toHaveBeenCalledWith(expect.any(String), '..', 'loaders', 'valueInjectionLoader.js');

      pathResolveSpy.mockReturnValue('/mocked/path/to/valueInjectionLoader.js');
    });
  });

  describe('with existing turbopack config', () => {
    it('should preserve existing turbopack config when no manifest is provided', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          resolveAlias: {
            '@': './src',
          },
          rules: {
            '*.test.js': ['jest-loader'],
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
      });

      expect(result).toEqual({
        resolveAlias: {
          '@': './src',
        },
        rules: {
          '*.test.js': ['jest-loader'],
        },
      });
    });

    it('should merge manifest rule with existing turbopack config', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          resolveAlias: {
            '@': './src',
          },
          rules: {
            '*.test.js': ['jest-loader'],
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result).toEqual({
        resolveAlias: {
          '@': './src',
        },
        rules: {
          '*.test.js': ['jest-loader'],
          '**/instrumentation-client.*': {
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
          },
        },
      });
    });

    it('should not override existing instrumentation rule', () => {
      const existingRule = {
        loaders: [
          {
            loader: '/existing/loader.js',
            options: { custom: 'value' },
          },
        ],
      };

      const userNextConfig: NextConfigObject = {
        turbopack: {
          rules: {
            '**/instrumentation.*': existingRule,
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
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
          },
          '**/instrumentation.*': existingRule,
        },
      });
    });
  });

  describe('with edge cases', () => {
    it('should handle empty route manifest', () => {
      const userNextConfig: NextConfigObject = {};
      const emptyManifest: RouteManifest = { dynamicRoutes: [], staticRoutes: [] };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: emptyManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryRouteManifest: JSON.stringify(emptyManifest),
                  },
                },
              },
            ],
          },
        },
      });
    });

    it('should handle complex route manifest', () => {
      const userNextConfig: NextConfigObject = {};
      const complexManifest: RouteManifest = {
        dynamicRoutes: [
          { path: '/users/[id]/posts/[postId]', regex: '/users/([^/]+)/posts/([^/]+)', paramNames: ['id', 'postId'] },
          { path: '/api/[...params]', regex: '/api/(.+)', paramNames: ['params'] },
        ],
        staticRoutes: [],
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: complexManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryRouteManifest: JSON.stringify(complexManifest),
                  },
                },
              },
            ],
          },
        },
      });
    });
  });

  describe('additional edge cases', () => {
    it('should handle undefined turbopack property', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: undefined,
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
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
          },
        },
      });
    });

    it('should handle null turbopack property', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: null as any,
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion: '15.0.0',
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: '15.0.0',
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: '15.0.0',
                  },
                },
              },
            ],
          },
        },
      });
    });

    it('should preserve other turbopack properties when adding rules', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          resolveAlias: {
            '@': './src',
            '@components': './src/components',
          },
          rules: {
            '*.css': ['css-loader'],
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
        nextJsVersion: '14.0.0',
      });

      expect(result).toEqual({
        resolveAlias: {
          '@': './src',
          '@components': './src/components',
        },
        rules: {
          '*.css': ['css-loader'],
          '**/instrumentation-client.*': {
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
          },
          '**/instrumentation.*': {
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
          },
        },
      });
    });

    it('should handle empty rules object in existing turbopack config', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          rules: {},
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
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
          },
        },
      });
    });

    it('should handle multiple colliding instrumentation rules', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          rules: {
            '**/instrumentation.*': ['existing-loader'],
            '**/instrumentation-client.*': { loaders: ['client-loader'] },
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
        nextJsVersion: '14.0.0',
      });

      // Should preserve existing rules and not add new ones
      expect(result).toEqual({
        rules: {
          '**/instrumentation.*': ['existing-loader'],
          '**/instrumentation-client.*': { loaders: ['client-loader'] },
        },
      });
    });
  });

  describe('Next.js version injection', () => {
    it('should create turbopack config with Next.js version rule when nextJsVersion is provided', () => {
      const userNextConfig: NextConfigObject = {};
      const nextJsVersion = '15.1.0';

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
        },
      });
    });

    it('should create turbopack config with both manifest and Next.js version rules', () => {
      const userNextConfig: NextConfigObject = {};
      const nextJsVersion = '14.2.5';

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
        nextJsVersion,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                    _sentryRouteManifest: JSON.stringify(mockRouteManifest),
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
        },
      });
    });

    it('should merge Next.js version rule with existing turbopack config', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          resolveAlias: {
            '@': './src',
          },
          rules: {
            '*.test.js': ['jest-loader'],
          },
        },
      };
      const nextJsVersion = '15.0.0';

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion,
      });

      expect(result).toEqual({
        resolveAlias: {
          '@': './src',
        },
        rules: {
          '*.test.js': ['jest-loader'],
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
        },
      });
    });

    it('should handle different Next.js version formats', () => {
      const userNextConfig: NextConfigObject = {};
      const testVersions = ['13.0.0', '14.1.2-canary.1', '15.0.0-rc.1', '16.0.0'];

      testVersions.forEach(version => {
        const result = constructTurbopackConfig({
          userNextConfig,
          userSentryOptions: mockSentryOptions,
          nextJsVersion: version,
        });

        expect(result.rules).toBeDefined();
        expect(result.rules!['**/instrumentation.*']).toBeDefined();

        const rule = result.rules!['**/instrumentation.*'];
        const ruleWithLoaders = rule as { loaders: Array<{ loader: string; options: any }> };
        expect(ruleWithLoaders.loaders[0]!.options.values._sentryNextJsVersion).toBe(version);
      });
    });

    it('should not create Next.js version rule when nextJsVersion is undefined', () => {
      const userNextConfig: NextConfigObject = {};

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion: undefined,
      });

      expect(result).toEqual({});
    });

    it('should not create Next.js version rule when nextJsVersion is empty string', () => {
      const userNextConfig: NextConfigObject = {};

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion: '',
      });

      expect(result).toEqual({});
    });

    it('should not override existing instrumentation rule when nextJsVersion is provided', () => {
      const existingRule = {
        loaders: [
          {
            loader: '/existing/loader.js',
            options: { custom: 'value' },
          },
        ],
      };

      const userNextConfig: NextConfigObject = {
        turbopack: {
          rules: {
            '**/instrumentation.*': existingRule,
          },
        },
      };
      const nextJsVersion = '15.1.0';

      const result = constructTurbopackConfig({
        userNextConfig,
        nextJsVersion,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': existingRule,
        },
      });
    });

    it('should handle all parameters together with existing config', () => {
      const userNextConfig: NextConfigObject = {
        turbopack: {
          resolveAlias: {
            '@components': './src/components',
          },
          rules: {
            '*.scss': ['sass-loader'],
          },
        },
      };
      const nextJsVersion = '14.0.0';

      const result = constructTurbopackConfig({
        userNextConfig,
        routeManifest: mockRouteManifest,
        nextJsVersion,
      });

      expect(result).toEqual({
        resolveAlias: {
          '@components': './src/components',
        },
        rules: {
          '*.scss': ['sass-loader'],
          '**/instrumentation-client.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                    _sentryRouteManifest: JSON.stringify(mockRouteManifest),
                  },
                },
              },
            ],
          },
          '**/instrumentation.*': {
            loaders: [
              {
                loader: '/mocked/path/to/valueInjectionLoader.js',
                options: {
                  values: {
                    _sentryNextJsVersion: nextJsVersion,
                  },
                },
              },
            ],
          },
        },
      });
    });
  });
});

describe('safelyAddTurbopackRule', () => {
  const mockRule = {
    loaders: [
      {
        loader: '/test/loader.js',
        options: { test: 'value' },
      },
    ],
  };

  describe('with undefined/null existingRules', () => {
    it('should create new rules object when existingRules is undefined', () => {
      const result = safelyAddTurbopackRule(undefined, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.test.js': mockRule,
      });
    });

    it('should create new rules object when existingRules is null', () => {
      const result = safelyAddTurbopackRule(null as any, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.test.js': mockRule,
      });
    });
  });

  describe('with existing rules', () => {
    it('should add new rule to existing rules object', () => {
      const existingRules = {
        '*.css': ['css-loader'],
        '*.scss': ['sass-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.scss': ['sass-loader'],
        '*.test.js': mockRule,
      });
    });

    it('should not override existing rule with same matcher', () => {
      const existingRule = {
        loaders: [
          {
            loader: '/existing/loader.js',
            options: { existing: 'option' },
          },
        ],
      };

      const existingRules = {
        '*.css': ['css-loader'],
        '*.test.js': existingRule,
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': existingRule,
      });
    });

    it('should handle empty rules object', () => {
      const existingRules = {};

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.test.js': mockRule,
      });
    });
  });

  describe('with different rule formats', () => {
    it('should handle string array rule (shortcut format)', () => {
      const existingRules = {
        '*.css': ['css-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: ['jest-loader', 'babel-loader'],
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': ['jest-loader', 'babel-loader'],
      });
    });

    it('should handle complex rule with conditions', () => {
      const existingRules = {
        '*.css': ['css-loader'],
      };

      const complexRule = {
        loaders: [
          {
            loader: '/test/loader.js',
            options: { test: 'value' },
          },
        ],
        as: 'javascript/auto',
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: complexRule,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': complexRule,
      });
    });

    it('should handle disabled rule (false)', () => {
      const existingRules = {
        '*.css': ['css-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: false,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': false,
      });
    });
  });

  describe('immutable', () => {
    it('should not mutate original existingRules object', () => {
      const existingRules = {
        '*.css': ['css-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': mockRule,
      });
    });
  });

  describe('additional edge cases for safelyAddTurbopackRule', () => {
    it('should handle falsy values in rules', () => {
      const existingRules = {
        '*.css': ['css-loader'],
        '*.disabled': false as any,
        '*.null': null as any,
      } as any;

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: mockRule,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.disabled': false,
        '*.null': null,
        '*.test.js': mockRule,
      } as any);
    });

    it('should handle undefined rule value', () => {
      const existingRules = {
        '*.css': ['css-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test.js',
        rule: undefined as any,
      });

      expect(result).toEqual({
        '*.css': ['css-loader'],
        '*.test.js': undefined,
      });
    });

    it('should handle complex matchers with special characters', () => {
      const existingRules = {};
      const complexMatcher = '**/node_modules/**/*.{js,ts}';

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: complexMatcher,
        rule: mockRule,
      });

      expect(result).toEqual({
        [complexMatcher]: mockRule,
      });
    });

    it('should preserve nested rule objects', () => {
      const complexRule = {
        loaders: [
          {
            loader: '/test/loader.js',
            options: {
              nested: {
                deep: 'value',
                array: [1, 2, 3],
              },
            },
          },
        ],
        as: 'javascript/auto',
        condition: 'test-condition',
      };

      const result = safelyAddTurbopackRule(undefined, {
        matcher: '*.complex.js',
        rule: complexRule,
      });

      expect(result).toEqual({
        '*.complex.js': complexRule,
      });
    });

    it('should handle matcher that matches an object property key pattern', () => {
      const existingRules = {
        '*.test': ['test-loader'],
        'test.*': ['pattern-loader'],
      };

      const result = safelyAddTurbopackRule(existingRules, {
        matcher: '*.test',
        rule: mockRule,
      });

      // Should not override the existing rule
      expect(result).toEqual({
        '*.test': ['test-loader'],
        'test.*': ['pattern-loader'],
      });
    });
  });
});
