import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { RouteManifest } from '../../../src/config/manifest/types';
import {
  constructTurbopackConfig,
  safelyAddTurbopackRule,
} from '../../../src/config/turbopack/constructTurbopackConfig';
import type { NextConfigObject, SentryBuildOptions } from '../../../src/config/types';

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
    routes: [
      { path: '/users', regex: '/users' },
      { path: '/users/[id]', regex: '/users/([^/]+)', paramNames: ['id'] },
      { path: '/api/health', regex: '/api/health' },
    ],
  };

  const mockSentryOptions: SentryBuildOptions = {
    org: 'test-org',
    project: 'test-project',
  };

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
        userSentryOptions: mockSentryOptions,
        manifest: mockRouteManifest,
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
        userSentryOptions: mockSentryOptions,
        manifest: mockRouteManifest,
      });

      expect(pathResolveSpy).toHaveBeenCalledWith(expect.any(String), 'loaders/valueInjectionLoader.js');
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
        userSentryOptions: mockSentryOptions,
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
        userSentryOptions: mockSentryOptions,
        manifest: mockRouteManifest,
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
            '**/instrumentation-client.*': existingRule,
          },
        },
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        userSentryOptions: mockSentryOptions,
        manifest: mockRouteManifest,
      });

      expect(result).toEqual({
        rules: {
          '**/instrumentation-client.*': existingRule,
        },
      });
    });
  });

  describe('with edge cases', () => {
    it('should handle empty route manifest', () => {
      const userNextConfig: NextConfigObject = {};
      const emptyManifest: RouteManifest = { routes: [] };

      const result = constructTurbopackConfig({
        userNextConfig,
        userSentryOptions: mockSentryOptions,
        manifest: emptyManifest,
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
        routes: [
          { path: '/users/[id]/posts/[postId]', regex: '/users/([^/]+)/posts/([^/]+)', paramNames: ['id', 'postId'] },
          { path: '/api/[...params]', regex: '/api/(.+)', paramNames: ['params'] },
        ],
      };

      const result = constructTurbopackConfig({
        userNextConfig,
        userSentryOptions: mockSentryOptions,
        manifest: complexManifest,
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
});
