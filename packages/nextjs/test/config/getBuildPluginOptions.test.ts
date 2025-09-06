import { describe, expect, it, vi } from 'vitest';
import { getBuildPluginOptions } from '../../src/config/getBuildPluginOptions';
import type { SentryBuildOptions } from '../../src/config/types';

describe('getBuildPluginOptions', () => {
  const mockReleaseName = 'test-release-1.0.0';
  const mockDistDirAbsPath = '/path/to/.next';

  describe('basic functionality', () => {
    it('returns correct build plugin options with minimal configuration', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        authToken: 'test-token',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
      });

      expect(result).toMatchObject({
        authToken: 'test-token',
        org: 'test-org',
        project: 'test-project',
        sourcemaps: {
          assets: ['/path/to/.next/**'],
          ignore: [],
          filesToDeleteAfterUpload: [],
          rewriteSources: expect.any(Function),
        },
        release: {
          inject: false,
          name: mockReleaseName,
          create: undefined,
          finalize: undefined,
        },
        _metaOptions: {
          loggerPrefixOverride: '[@sentry/nextjs]',
          telemetry: {
            metaFramework: 'nextjs',
          },
        },
        bundleSizeOptimizations: {},
      });
    });

    it('normalizes Windows paths to posix for glob patterns', () => {
      const windowsPath = 'C:\\Users\\test\\.next';
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: windowsPath,
      });

      expect(result.sourcemaps?.assets).toEqual(['C:/Users/test/.next/**']);
    });
  });

  describe('sourcemap configuration', () => {
    it('configures file deletion when deleteSourcemapsAfterUpload is enabled', () => {
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
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        '/path/to/.next/**/*.js.map',
        '/path/to/.next/**/*.mjs.map',
        '/path/to/.next/**/*.cjs.map',
      ]);
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
      });

      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([]);
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
      });

      expect(result.sourcemaps?.assets).toEqual(customAssets);
    });

    it('uses custom sourcemap ignore patterns when provided', () => {
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
      });

      expect(result.sourcemaps?.ignore).toEqual(customIgnore);
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
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
      });

      // The unstable_sentryWebpackPluginOptions.release is spread at the end and may override base properties
      expect(result.release).toHaveProperty('setCommits.auto', true);
      expect(result.release).toHaveProperty('deploy.env', 'production');
    });
  });

  describe('react component annotation', () => {
    it('merges react component annotation options correctly', () => {
      const sentryBuildOptions: SentryBuildOptions = {
        org: 'test-org',
        project: 'test-project',
        reactComponentAnnotation: {
          enabled: true,
        },
        unstable_sentryWebpackPluginOptions: {
          reactComponentAnnotation: {
            enabled: false, // This will override the base setting
          },
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
      });

      // The unstable options override the base options - in this case enabled should be false
      expect(result.reactComponentAnnotation).toHaveProperty('enabled', false);
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
        unstable_sentryWebpackPluginOptions: {
          applicationKey: 'test-app-key',
          sourcemaps: {
            disable: false,
          },
        },
      };

      const result = getBuildPluginOptions({
        sentryBuildOptions,
        releaseName: mockReleaseName,
        distDirAbsPath: mockDistDirAbsPath,
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
      });

      expect(result.sourcemaps).toMatchObject({
        disable: undefined,
        assets: ['/path/to/.next/**'],
        ignore: [],
        filesToDeleteAfterUpload: [],
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
      });

      expect(result.sourcemaps?.assets).toEqual([`${complexPath}/**`]);
      expect(result.sourcemaps?.filesToDeleteAfterUpload).toEqual([
        `${complexPath}/**/*.js.map`,
        `${complexPath}/**/*.mjs.map`,
        `${complexPath}/**/*.cjs.map`,
      ]);
    });
  });
});
