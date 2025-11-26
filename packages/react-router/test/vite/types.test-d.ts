import { describe, expectTypeOf, it } from 'vitest';
import type { SentryReactRouterBuildOptions } from '../../src/vite/types';

describe('Sentry React-Router build-time options type', () => {
  it('includes all options based on type BuildTimeOptionsBase', () => {
    const completeOptions: SentryReactRouterBuildOptions = {
      // --- BuildTimeOptionsBase options ---
      org: 'test-org',
      project: 'test-project',
      authToken: 'test-auth-token',
      sentryUrl: 'https://sentry.io',
      headers: { Authorization: ' Bearer test-auth-token' },
      telemetry: true,
      silent: false,
      // eslint-disable-next-line no-console
      errorHandler: (err: Error) => console.warn(err),
      debug: false,
      sourcemaps: {
        disable: false,
        assets: ['./dist/**/*'],
        ignore: ['./dist/*.map'],
        filesToDeleteAfterUpload: ['./dist/*.map'],
      },
      release: {
        name: 'test-release-1.0.0',
        create: true,
        finalize: true,
        dist: 'test-dist',
        vcsRemote: 'origin',
        setCommits: {
          auto: false,
          repo: 'test/repo',
          commit: 'abc123',
          previousCommit: 'def456',
          ignoreMissing: false,
          ignoreEmpty: false,
        },
        deploy: {
          env: 'production',
          started: 1234567890,
          finished: 1234567900,
          time: 10,
          name: 'deployment-name',
          url: 'https://example.com',
        },
      },
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: false,
        excludeReplayShadowDom: true,
        excludeReplayIframe: true,
        excludeReplayWorker: true,
      },

      // --- SentryReactRouterBuildOptions specific options ---
      reactComponentAnnotation: { enabled: true, ignoredComponents: ['IgnoredComponent1', 'IgnoredComponent2'] },

      unstable_sentryVitePluginOptions: {
        // Rollup plugin options
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
        // Vite plugin options
        sourcemaps: {
          assets: './dist/**/*',
        },
      },
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryReactRouterBuildOptions>();
  });

  it('includes all deprecated options', () => {
    const completeOptions: SentryReactRouterBuildOptions = {
      // SentryNuxtModuleOptions specific options
      reactComponentAnnotation: { enabled: true, ignoredComponents: ['IgnoredComponent1', 'IgnoredComponent2'] },

      unstable_sentryVitePluginOptions: {
        // Rollup plugin options
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
        // Vite plugin options
        sourcemaps: {
          assets: './dist/**/*',
        },
      },

      // Deprecated sourceMapsUploadOptions
      sourceMapsUploadOptions: {
        release: {
          name: 'deprecated-release',
        },
        enabled: true,
        filesToDeleteAfterUpload: ['./build/*.map'],
      },
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryReactRouterBuildOptions>();
  });

  it('allows partial configuration', () => {
    const minimalOptions: SentryReactRouterBuildOptions = { reactComponentAnnotation: { enabled: true } };

    expectTypeOf(minimalOptions).toEqualTypeOf<SentryReactRouterBuildOptions>();

    const partialOptions: SentryReactRouterBuildOptions = {
      reactComponentAnnotation: { enabled: true },
      debug: false,
    };

    expectTypeOf(partialOptions).toEqualTypeOf<SentryReactRouterBuildOptions>();
  });
});
