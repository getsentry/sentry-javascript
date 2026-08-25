import { describe, expectTypeOf, it } from 'vitest';
import type { SentryBuildOptions } from '../../src/config/types';

describe('Sentry Next.js build-time options type', () => {
  it('includes all options based on type BuildTimeOptionsBase', () => {
    const completeOptions: SentryBuildOptions = {
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
        assets: ['./.next/**/*'],
        ignore: ['./.next/*.map'],
        filesToDeleteAfterUpload: ['./.next/*.map'],
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
      applicationKey: 'test-application-key',

      // --- SentryBuildOptions specific options ---
      reactComponentAnnotation: { enabled: true, ignoredComponents: ['Ignored'] },
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
      suppressOnRouterTransitionStartWarning: true,
      routeManifestInjection: { exclude: ['/admin', /^\/internal\//] },
      useRunAfterProductionCompileHook: true,
      _experimental: { thirdPartyOriginStackFrames: true, vercelCronsMonitoring: true },
      webpack: { autoInstrumentServerFunctions: true, autoInstrumentMiddleware: false },
    };

    expectTypeOf(completeOptions).toEqualTypeOf<SentryBuildOptions>();
  });

  it('supports the Next.js-specific option shapes', () => {
    const options: SentryBuildOptions = {
      // Next.js uploads source maps to multiple projects
      project: ['project-a', 'project-b'],
      sourcemaps: {
        // Next.js-only: source maps are deleted from the build folder after upload
        deleteSourcemapsAfterUpload: false,
        // shared with the base type, but Next.js merges these with its own internal ignore patterns
        ignore: '**/custom-ignore/**',
      },
      tunnelRoute: true,
      routeManifestInjection: false,
    };

    expectTypeOf(options).toEqualTypeOf<SentryBuildOptions>();
  });

  it('supports disabling source map upload while keeping debug ID injection', () => {
    const options: SentryBuildOptions = { sourcemaps: { disable: 'disable-upload' } };

    expectTypeOf(options).toEqualTypeOf<SentryBuildOptions>();
  });

  it('supports opting out of commit association and deploy creation', () => {
    const options: SentryBuildOptions = { release: { setCommits: false, deploy: false } };

    expectTypeOf(options).toEqualTypeOf<SentryBuildOptions>();
  });

  it('rejects `release.inject`, which the SDK controls itself', () => {
    const options: SentryBuildOptions = {
      release: {
        // @ts-expect-error - the SDK always injects the release via its own value injection loader
        inject: true,
      },
    };

    expectTypeOf(options).toEqualTypeOf<SentryBuildOptions>();
  });

  it('allows partial configuration', () => {
    const minimalOptions: SentryBuildOptions = {};

    expectTypeOf(minimalOptions).toEqualTypeOf<SentryBuildOptions>();

    const partialOptions: SentryBuildOptions = { org: 'my-org', project: 'my-project', debug: false };

    expectTypeOf(partialOptions).toEqualTypeOf<SentryBuildOptions>();
  });
});
