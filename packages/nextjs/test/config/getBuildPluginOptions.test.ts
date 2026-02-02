import { describe, expect, it, vi } from 'vitest';
import { getBuildPluginOptions } from '../../src/config/getBuildPluginOptions';
import type { SentryBuildOptions } from '../../src/config/types';

describe('getBuildPluginOptions', () => {
  const mockReleaseName = 'test-release-1.0.0';
  const mockDistDirAbsPath = '/path/to/.next';

  describe('basic functionality', () => {
    it('returns correct build plugin options with minimal configuration for after-production-compile-webpack', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        authToken: 'test-token',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-webpack',
      });

      expect(result).toMatchObject({
        authToken: 'test-token',
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          assets: ['/path/to/.next/server', '/path/to/.next/static/chunks/pages', '/path/to/.next/static/chunks/app'],
          ignore: [
            '/path/to/.next/static/chunks/main-*',
            '/path/to/.next/static/chunks/framework-*',
            '/path/to/.next/static/chunks/framework.*',
            '/path/to/.next/static/chunks/polyfills-*',
            '/path/to/.next/static/chunks/webpack-*',
            '**/page_client-reference-manifest.js',
            '**/server-reference-manifest.js',
            '**/next-font-manifest.js',
            '**/middleware-build-manifest.js',
            '**/interception-route-rewrite-manifest.js',
            '**/route_client-reference-manifest.js',
            '**/middleware-react-loadable-manifest.js',
          ],
          filesToDeleteAfterUpload: undefined,
          rewriteSources: expect.any(Function),
        },
        release: {
          inject: false,
          name: mockReleaseName,
          create: undefined,
          finalize: undefined,
        },
        _metaOptions: {
          loggerPrefixOverride: '[@sentry/nextjs - After Production Compile (Webpack)]',
          telemetry: {
            metaFramework: 'nextjs',
          },
        },
        bundleSizeOptimizations: {},
        reactComponentAnnotation: undefined, // Should be undefined for after-production-compile
      });
    });

    it('normalizes Windows paths to posix for glob patterns in after-production-compile builds', () => {
      const windowsPath = 'C:\\Users\\test\\.next';
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: windowsPath,
        buildTool: 'after-production-compile-webpack',
      });

      expect(result.sourcemaps?.assets).toEqual([
        'C:/Users/test/.next/server',
        'C:/Users/test/.next/static/chunks/pages',
        'C:/Users/test/.next/static/chunks/app',
      ]);
    });

    it('normalizes Windows paths to posix for webpack builds', () => {
      const windowsPath = 'C:\\Users\\test\\.next';
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: windowsPath,
        buildTool: 'webpack-client',
      });

      expect(result.sourcemaps?.assets).toEqual([
        'C:/Users/test/.next/static/chunks/pages/**',
        'C:/Users/test/.next/static/chunks/app/**',
      ]);
    });
  });

  describe('build tool specific behavior', () => {
    const baseSentryOptions: SentryBuildOptions = {
      org: 'test-org',
      project: 'test-project',
    };

    it('configures webpack-client build correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result._metaOptions?.loggerPrefixOverride).toBe('[@sentry/nextjs - Client]');
      expect(result.sourcemaps?.assets).toEqual([
        '/path/to/.next/static/chunks/pages/**',
        '/path/to/.next/static/chunks/app/**',
      ]);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
      expect(result.reactComponentAnnotation).toBeDefined();
    });

    it('configures webpack-client build with widenClientFileUpload correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: {
          ...baseSentryOptions,
          widenClientFileUpload: true,
        },
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.sourcemaps?.assets).toEqual(['/path/to/.next/static/chunks/**']);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
    });

    it('configures webpack-nodejs build correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-nodejs',
      });

      expect(result._metaOptions?.loggerPrefixOverride).toBe('[@sentry/nextjs - Node.js]');
      expect(result.sourcemaps?.assets).toEqual(['/path/to/.next/server/**', '/path/to/.next/serverless/**']);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
      expect(result.reactComponentAnnotation).toBeDefined();
    });

    it('configures webpack-edge build correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-edge',
      });

      expect(result._metaOptions?.loggerPrefixOverride).toBe('[@sentry/nextjs - Edge]');
      expect(result.sourcemaps?.assets).toEqual(['/path/to/.next/server/**', '/path/to/.next/serverless/**']);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
      expect(result.reactComponentAnnotation).toBeDefined();
    });

    it('configures after-production-compile-webpack build correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-webpack',
      });

      expect(result._metaOptions?.loggerPrefixOverride).toBe('[@sentry/nextjs - After Production Compile (Webpack)]');
      expect(result.sourcemaps?.assets).toEqual([
        '/path/to/.next/server',
        '/path/to/.next/static/chunks/pages',
        '/path/to/.next/static/chunks/app',
      ]);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
      expect(result.reactComponentAnnotation).toBeUndefined();
    });

    it('configures after-production-compile-turbopack build correctly', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-turbopack',
      });

      expect(result._metaOptions?.loggerPrefixOverride).toBe('[@sentry/nextjs - After Production Compile (Turbopack)]');
      expect(result.sourcemaps?.assets).toEqual([
        '/path/to/.next/server',
        '/path/to/.next/static/chunks', // Turbopack uses broader pattern
      ]);
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
      ]);
      expect(result.reactComponentAnnotation).toBeUndefined();
    });
  });

  describe('useRunAfterProductionCompileHook functionality', () => {
    const baseSentryOptions: SentryBuildOptions = {
      org: 'test-org',
      project: 'test-project',
    };

    it('disables sourcemaps when useRunAfterProductionCompileHook is true for webpack builds', () => {
      const webpackBuildTools = ['webpack-client', 'webpack-nodejs', 'webpack-edge'] as const;

      webpackBuildTools.forEach(buildTool => {
        const result = getBuildPluginOptions({
          sentryBuildOptions: baseSentryOptions,
          releaseName: mockReleaseName,
          distDirAbsPath: mockDistDirAbsPath,
          buildTool,
          useRunAfterProductionCompileHook: true,
        });

        expect(result.sourcemaps?.disable).toBe(true);
      });
    });

    it('does not disable sourcemaps when useRunAfterProductionCompileHook is true for after-production-compile builds', () => {
      const afterProductionCompileBuildTools = [
        'after-production-compile-webpack',
        'after-production-compile-turbopack',
      ] as const;

      afterProductionCompileBuildTools.forEach(buildTool => {
        const result = getBuildPluginOptions({
          sentryBuildOptions: baseSentryOptions,
          releaseName: mockReleaseName,
          distDirAbsPath: mockDistDirAbsPath,
          buildTool,
          useRunAfterProductionCompileHook: true,
        });

        expect(result.sourcemaps?.disable).toBe(false);
      });
    });

    it('does not disable sourcemaps when useRunAfterProductionCompileHook is false', () => {
      const result = getBuildPluginOptions({
        sentryBuildOptions: baseSentryOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
        useRunAfterProductionCompileHook: false,
      });

      expect(result.sourcemaps?.disable).toBe(false);
    });
  });

  describe('sourcemap configuration', () => {
    it('configures file deletion when deleteSourcemapsAfterUpload is enabled for after-production-compile-webpack', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-webpack',
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        '/path/to/.next/static/**/*.js.map',
        '/path/to/.next/static/**/*.mjs.map',
        '/path/to/.next/static/**/*.cjs.map',
        '/path/to/.next/static/**/*.css.map',
      ]);
    });

    it('configures file deletion when deleteSourcemapsAfterUpload is enabled for after-production-compile-turbopack', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-turbopack',
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        '/path/to/.next/static/**/*.js.map',
        '/path/to/.next/static/**/*.mjs.map',
        '/path/to/.next/static/**/*.cjs.map',
        '/path/to/.next/static/**/*.css.map',
      ]);
    });

    it('configures file deletion when deleteSourcemapsAfterUpload is enabled for webpack-client without useRunAfterProductionCompileHook', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
        useRunAfterProductionCompileHook: false,
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        '/path/to/.next/static/**/*.js.map',
        '/path/to/.next/static/**/*.mjs.map',
        '/path/to/.next/static/**/*.cjs.map',
        '/path/to/.next/static/**/*.css.map',
      ]);
    });

    it('does not configure file deletion when deleteSourcemapsAfterUpload is enabled for webpack-client with useRunAfterProductionCompileHook', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
        useRunAfterProductionCompileHook: true,
      });

      // File deletion should be undefined when using the hook
      expect(result.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
    });

    it('does not configure file deletion for server builds even when deleteSourcemapsAfterUpload is enabled', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const serverBuildTools = ['webpack-nodejs', 'webpack-edge'] as const;

      serverBuildTools.forEach(buildTool => {
        const result = getBuildPluginOptions({
          sentryBuildOptions,
          releaseName: mockReleaseName,
          distDirAbsPath: mockDistDirAbsPath,
          buildTool,
        });

        expect(result.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
      });
    });

    it('does not configure file deletion when deleteSourcemapsAfterUpload is disabled', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: false,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
    });

    it('uses custom sourcemap assets when provided', () => {
      const customAssets = ['custom/path/**', 'another/path/**'];
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          assets: customAssets,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.sourcemaps?.assets).toEqual(customAssets);
    });

    it('merges custom sourcemap ignore patterns with defaults', () => {
      const customIgnore = ['**/vendor/**', '**/node_modules/**'];
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          ignore: customIgnore,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      // Custom patterns should be appended to defaults, not replace them
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
        '**/vendor/**',
        '**/node_modules/**',
      ]);
    });

    it('handles single string custom sourcemap ignore pattern', () => {
      const customIgnore = '**/vendor/**';
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          ignore: customIgnore,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      // Single string pattern should be appended to defaults
      expect(result.sourcemaps?.ignore).toEqual([
        '/path/to/.next/static/chunks/main-*',
        '/path/to/.next/static/chunks/framework-*',
        '/path/to/.next/static/chunks/framework.*',
        '/path/to/.next/static/chunks/polyfills-*',
        '/path/to/.next/static/chunks/webpack-*',
        '**/page_client-reference-manifest.js',
        '**/server-reference-manifest.js',
        '**/next-font-manifest.js',
        '**/middleware-build-manifest.js',
        '**/interception-route-rewrite-manifest.js',
        '**/route_client-reference-manifest.js',
        '**/middleware-react-loadable-manifest.js',
        '**/vendor/**',
      ]);
    });

    it('disables sourcemaps when disable flag is set', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          disable: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.sourcemaps?.disable).toBe(true);
    });
  });

  describe('source rewriting functionality', () => {
    it('rewrites webpack sources correctly', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      const rewriteSources = result.sourcemaps?.rewriteSources;
      expect(rewriteSources).toBeDefined();

      if (rewriteSources) {
        // Test webpack://_N_E/ prefix removal
        expect(rewriteSources('webpack://_N_E/src/pages/index.js', {})).toBe('src/pages/index.js');

        // Test general webpack:// prefix removal
        expect(rewriteSources('webpack://project/src/components/Button.js', {})).toBe(
          'project/src/components/Button.js',
        );

        // Test no rewriting for normal paths
        expect(rewriteSources('src/utils/helpers.js', {})).toBe('src/utils/helpers.js');
        expect(rewriteSources('./components/Layout.tsx', {})).toBe('./components/Layout.tsx');
      }
    });
  });

  describe('release configuration', () => {
    it('configures release with injection disabled when release name is provided', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        release: {
          create: true,
          finalize: true,
          dist: 'production',
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.release).toMatchObject({
        inject: false,
        name: mockReleaseName,
        create: true,
        finalize: true,
        dist: 'production',
      });
    });

    it('configures release as disabled when no release name is provided', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: undefined,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.release).toMatchObject({
        inject: false,
        create: false,
        finalize: false,
      });
    });

    it('merges webpack plugin release options correctly', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        release: {
          create: true,
          vcsRemote: 'origin',
        },
        webpack: {
          unstable_sentryWebpackPluginOptions: {
            release: {
              setCommits: {
                auto: true,
              },
              deploy: {
                env: 'production',
              },
            },
          },
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      // The webpack.unstable_sentryWebpackPluginOptions.release is spread at the end and may override base properties
      expect(result.release).toHaveProperty('setCommits.auto', true);
      expect(result.release).toHaveProperty('deploy.env', 'production');
    });
  });

  describe('react component annotation', () => {
    it('merges react component annotation options correctly for webpack builds', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        webpack: {
          reactComponentAnnotation: {
            enabled: true,
          },
          unstable_sentryWebpackPluginOptions: {
            reactComponentAnnotation: {
              enabled: false, // This will override the base setting
            },
          },
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      // The unstable options override the base options - in this case enabled should be false
      expect(result.reactComponentAnnotation).toHaveProperty('enabled', false);
    });

    it('sets react component annotation to undefined for after-production-compile builds', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        reactComponentAnnotation: {
          enabled: true,
        },
      };

      const afterProductionCompileBuildTools = [
        'after-production-compile-webpack',
        'after-production-compile-turbopack',
      ] as const;

      afterProductionCompileBuildTools.forEach(buildTool => {
        const result = getBuildPluginOptions({
          sentryBuildOptions,
          releaseName: mockReleaseName,
          distDirAbsPath: mockDistDirAbsPath,
          buildTool,
        });

        expect(result.reactComponentAnnotation).toBeUndefined();
      });
    });
  });

  describe('other configuration options', () => {
    it('passes through all standard configuration options', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        authToken: 'test-token',
        headers: { 'Custom-Header': 'value' },
        telemetry: false,
        debug: true,
        errorHandler: vi.fn(),
        silent: true,
        sentryUrl: 'https://custom.sentry.io',
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result).toMatchObject({
        authToken: 'test-token',
        headers: { 'Custom-Header': 'value' },
        org: 'test-org',
        project: 'test-project',
        telemetry: false,
        debug: true,
        errorHandler: sentryBuildOptions.errorHandler,
        silent: true,
        url: 'https://custom.sentry.io',
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
      });
    });

    it('merges unstable webpack plugin options correctly', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        webpack: {
          unstable_sentryWebpackPluginOptions: {
            applicationKey: 'test-app-key',
            sourcemaps: {
              disable: false,
            },
          },
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result).toMatchObject({
        applicationKey: 'test-app-key',
        sourcemaps: expect.objectContaining({
          disable: false,
        }),
      });
    });
  });

  describe('edge cases', () => {
    it('handles undefined release name gracefully', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: undefined,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'webpack-client',
      });

      expect(result.release).toMatchObject({
        inject: false,
        create: false,
        finalize: false,
      });
    });

    it('handles empty sourcemaps configuration', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {},
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
        buildTool: 'after-production-compile-webpack',
      });

      expect(result.sourcemaps).toMatchObject({
        disable: false,
        assets: ['/path/to/.next/server', '/path/to/.next/static/chunks/pages', '/path/to/.next/static/chunks/app'],
        ignore: [
          '/path/to/.next/static/chunks/main-*',
          '/path/to/.next/static/chunks/framework-*',
          '/path/to/.next/static/chunks/framework.*',
          '/path/to/.next/static/chunks/polyfills-*',
          '/path/to/.next/static/chunks/webpack-*',
          '**/page_client-reference-manifest.js',
          '**/server-reference-manifest.js',
          '**/next-font-manifest.js',
          '**/middleware-build-manifest.js',
          '**/interception-route-rewrite-manifest.js',
          '**/route_client-reference-manifest.js',
          '**/middleware-react-loadable-manifest.js',
        ],
        filesToDeleteAfterUpload: undefined,
        rewriteSources: expect.any(Function),
      });
    });

    it('handles complex nested path structures', () => {
      const complexPath = '/very/deep/nested/path/with/multiple/segments/.next';
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: complexPath,
        buildTool: 'after-production-compile-turbopack',
      });

      expect(result.sourcemaps?.assets).toEqual([`${complexPath}/server`, `${complexPath}/static/chunks`]);
      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        `${complexPath}/static/**/*.js.map`,
        `${complexPath}/static/**/*.mjs.map`,
        `${complexPath}/static/**/*.cjs.map`,
        `${complexPath}/static/**/*.css.map`,
      ]);
    });
  });
});
