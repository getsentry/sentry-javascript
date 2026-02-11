import { describe, expectTypeOf, it } from 'vitest';
import type { SentryNuxtModuleOptions } from '../../src/common/types';

describe('Sentry Nuxt build-time options type', () => {
  it('includes all options based on type BuildTimeOptionsBase', () => {
    const completeOptions: SentryNuxtModuleOptions = {
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

      // --- SentryNuxtModuleOptions specific options ---
      enabled: true,
      autoInjectServerSentry: 'experimental_dynamic-import',
      experimental_entrypointWrappedFunctions: ['default', 'handler', 'server', 'customExport'],
      unstable_sentryBundlerPluginOptions: {
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

    expectTypeOf(completeOptions).toEqualTypeOf<SentryNuxtModuleOptions>();
  });

  it('includes all deprecated options', () => {
    const completeOptions: SentryNuxtModuleOptions = {
      // SentryNuxtModuleOptions specific options
      enabled: true,
      debug: true,
      autoInjectServerSentry: 'experimental_dynamic-import', // No need for 'as const' with type assertion
      experimental_entrypointWrappedFunctions: ['default', 'handler', 'server', 'customExport'],
      unstable_sentryBundlerPluginOptions: {
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
        silent: false,
        // eslint-disable-next-line no-console
        errorHandler: (err: Error) => console.warn(err),
        release: {
          name: 'deprecated-release',
        },
        enabled: true,
        authToken: 'deprecated-token',
        org: 'deprecated-org',
        url: 'https://deprecated.sentry.io',
        project: 'deprecated-project',
        telemetry: false,
        sourcemaps: {
          assets: './build/**/*',
          ignore: ['./build/*.spec.js'],
          filesToDeleteAfterUpload: ['./build/*.map'],
        },
      },
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryNuxtModuleOptions>();
  });

  it('allows partial configuration', () => {
    const minimalOptions: SentryNuxtModuleOptions = { enabled: true };

    expectTypeOf(minimalOptions).toEqualTypeOf<SentryNuxtModuleOptions>();

    const partialOptions: SentryNuxtModuleOptions = {
      enabled: true,
      debug: false,
    };

    expectTypeOf(partialOptions).toEqualTypeOf<SentryNuxtModuleOptions>();
  });
});
