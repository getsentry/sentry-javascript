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
        rewriteSources: (source: string) => source,
        resolveSourceMap: (artifactPath: string) => `${artifactPath}.map`,
      },
      moduleMetadata: { team: 'sdk' },
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
      buildTimeInstrumentation: false,

      // --- SentryNuxtModuleOptions specific options ---
      enabled: true,
      autoInjectServerSentry: 'experimental_dynamic-import',
      configDir: '~/custom-config',
      experimental_entrypointWrappedFunctions: ['default', 'handler', 'server', 'customExport'],
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryNuxtModuleOptions>();
  });

  it('rejects the removed `unstable_sentryBundlerPluginOptions`', () => {
    const options: SentryNuxtModuleOptions = {
      // @ts-expect-error - removed in v11, use the top-level build options instead
      unstable_sentryBundlerPluginOptions: {
        sourcemaps: { assets: './dist/**/*' },
      },
    };

    expectTypeOf(options).toEqualTypeOf<SentryNuxtModuleOptions>();
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
