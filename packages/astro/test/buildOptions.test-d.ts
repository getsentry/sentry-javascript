import { describe, expectTypeOf, it } from 'vitest';
import type { SentryOptions } from '../src/integration/types';

describe('Sentry Astro build-time options type', () => {
  it('includes all options based on type BuildTimeOptionsBase', () => {
    const completeOptions: SentryOptions = {
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

      // --- UnstableVitePluginOptions ---
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: './dist/**/*',
        },
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
      },

      // --- SentryOptions specific options ---
      enabled: true,
      clientInitPath: './src/sentry.client.config.ts',
      serverInitPath: './src/sentry.server.config.ts',
      autoInstrumentation: {
        requestHandler: true,
      },

      // Deprecated runtime options
      environment: 'test',
      dsn: 'https://test@sentry.io/123',
      sampleRate: 1.0,
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryOptions>();
  });

  it('includes all deprecated options', () => {
    const completeOptions: SentryOptions = {
      // SentryOptions specific options
      enabled: true,
      debug: true,
      clientInitPath: './src/sentry.client.config.ts',
      serverInitPath: './src/sentry.server.config.ts',
      autoInstrumentation: {
        requestHandler: true,
      },
      unstable_sentryVitePluginOptions: {
        sourcemaps: {
          assets: './dist/**/*',
        },
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
        },
      },

      // Deprecated sourceMapsUploadOptions
      sourceMapsUploadOptions: {
        enabled: true,
        authToken: 'deprecated-token',
        org: 'deprecated-org',
        project: 'deprecated-project',
        telemetry: false,
        assets: './build/**/*',
        filesToDeleteAfterUpload: ['./build/*.map'],
        unstable_sentryVitePluginOptions: {
          sourcemaps: {
            ignore: ['./build/*.spec.js'],
          },
        },
      },
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryOptions>();
  });

  it('allows partial configuration', () => {
    const minimalOptions: SentryOptions = { enabled: true };

    expectTypeOf(minimalOptions).toEqualTypeOf<SentryOptions>();

    const partialOptions: SentryOptions = {
      enabled: true,
      debug: false,
      org: 'my-org',
      project: 'my-project',
    };

    expectTypeOf(partialOptions).toEqualTypeOf<SentryOptions>();
  });

  it('supports BuildTimeOptionsBase options at top level', () => {
    const baseOptions: SentryOptions = {
      // Test that all BuildTimeOptionsBase options are available at top level
      org: 'test-org',
      project: 'test-project',
      authToken: 'test-token',
      sentryUrl: 'https://custom.sentry.io',
      headers: { 'Custom-Header': 'value' },
      telemetry: false,
      silent: true,
      debug: true,
      sourcemaps: {
        disable: false,
        assets: ['./dist/**/*.js'],
        ignore: ['./dist/test/**/*'],
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      release: {
        name: '1.0.0',
        create: true,
        finalize: false,
      },
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: true,
      },
    };

    expectTypeOf(baseOptions).toEqualTypeOf<SentryOptions>();
  });

  it('supports UnstableVitePluginOptions at top level', () => {
    const viteOptions: SentryOptions = {
      unstable_sentryVitePluginOptions: {
        org: 'override-org',
        project: 'override-project',
        sourcemaps: {
          assets: './custom-dist/**/*',
          ignore: ['./custom-dist/ignore/**/*'],
        },
        bundleSizeOptimizations: {
          excludeDebugStatements: true,
          excludeTracing: false,
        },
        debug: true,
        silent: false,
      },
    };

    expectTypeOf(viteOptions).toEqualTypeOf<SentryOptions>();
  });
});
