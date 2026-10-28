import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextConfigObject } from '../../../src/config/types';
import { warnIfMissingInstrumentationFile } from '../../../src/config/withSentryConfig/getFinalConfigObjectUtils';
import { makeProject, removeProjects } from './projectFixture';

const HANDLER_REWRITE = { source: '/monitoring', destination: '/sentry-tunnel' };

afterEach(() => {
  removeProjects();
});

describe('maybeSetUpTunnelRouteRewriteRules', () => {
  beforeAll(async () => {
    // The first import transforms the whole dependency tree, which can
    // take longer than the test timeout on a slow CI runner. A timed-out
    // test keeps running and logs into the next test's spies. Imports
    // after `vi.resetModules()` reuse these transforms.
    await import('../../../src/config/withSentryConfig/getFinalConfigObjectUtils');
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    // A fresh module per test, because the function logs each message only once.
    vi.resetModules();
    delete process.env.__SENTRY_TUNNEL_ROUTE__;
  });

  async function setUp(files: string[]) {
    vi.spyOn(process, 'cwd').mockReturnValue(makeProject(files));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { maybeSetUpTunnelRouteRewriteRules } =
      await import('../../../src/config/withSentryConfig/getFinalConfigObjectUtils');
    return { maybeSetUpTunnelRouteRewriteRules, logSpy, warnSpy };
  }

  it('sets up the handler rewrite when the project has a tunnel route handler', async () => {
    const { maybeSetUpTunnelRouteRewriteRules } = await setUp(['app/sentry-tunnel/route.ts']);
    const nextConfig: NextConfigObject = {};

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: '/monitoring' });

    await expect(nextConfig.rewrites?.()).resolves.toEqual({ beforeFiles: [HANDLER_REWRITE], afterFiles: [] });
  });

  it('logs the tunnel route handler file once', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, logSpy } = await setUp(['app/sentry-tunnel/route.ts']);

    maybeSetUpTunnelRouteRewriteRules({}, { tunnelRoute: '/monitoring' });
    maybeSetUpTunnelRouteRewriteRules({}, { tunnelRoute: '/monitoring' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[@sentry/nextjs] The tunnel route sends events through app/sentry-tunnel/route.ts. Only the event payload goes to Sentry.',
    );
  });

  it('sets up the external rewrite when the project has no tunnel route handler', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, logSpy } = await setUp(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: '/monitoring' });

    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      {
        source: '/monitoring(/?)',
        has: [
          { type: 'query', key: 'o', value: '(?<orgid>\\d*)' },
          { type: 'query', key: 'p', value: '(?<projectid>\\d*)' },
          { type: 'query', key: 'r', value: '(?<region>[a-z]{2})' },
        ],
        destination: 'https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0',
      },
      {
        source: '/monitoring(/?)',
        has: [
          { type: 'query', key: 'o', value: '(?<orgid>\\d*)' },
          { type: 'query', key: 'p', value: '(?<projectid>\\d*)' },
        ],
        destination: 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0',
      },
    ]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does not log with `silent`', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, logSpy } = await setUp(['app/sentry-tunnel/route.ts']);

    maybeSetUpTunnelRouteRewriteRules({}, { tunnelRoute: '/monitoring', silent: true });

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warns once when the project has a tunnel route handler but `tunnelRoute` is not set', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, warnSpy } = await setUp(['src/app/sentry-tunnel/route.tsx']);
    const nextConfig: NextConfigObject = {};

    maybeSetUpTunnelRouteRewriteRules(nextConfig, {});
    maybeSetUpTunnelRouteRewriteRules({}, {});

    expect(nextConfig.rewrites).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[@sentry/nextjs] Found src/app/sentry-tunnel/route.tsx, but the `tunnelRoute` option is not set. Set `tunnelRoute` in `withSentryConfig` to send events through this route.',
    );
  });

  it('sets up no rewrite for a static export with a tunnel route handler', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, logSpy, warnSpy } = await setUp(['app/sentry-tunnel/route.ts']);
    const nextConfig: NextConfigObject = { output: 'export' };

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: '/monitoring' });

    expect(nextConfig.rewrites).toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('will not work in combination with Next.js static exports'),
    );
  });

  it.each([
    ['`tunnelRoute` is `false`', {}, { tunnelRoute: false }],
    ['`tunnelRoute` is not set in a static export', { output: 'export' }, {}],
  ])('does not warn about the tunnel route handler when %s', async (_description, nextConfig, sentryOptions) => {
    const { maybeSetUpTunnelRouteRewriteRules, warnSpy } = await setUp(['app/sentry-tunnel/route.ts']);

    maybeSetUpTunnelRouteRewriteRules(nextConfig, sentryOptions);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('warnIfMissingInstrumentationFile', () => {
  const ROOT_FILE_WITH_SRC_APP = ['src/app/page.tsx', 'instrumentation.ts'];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('__SENTRY_MISSING_INSTRUMENTATION_FILE_WARNING_SHOWN__', undefined);
  });

  function setUp(files: string[]) {
    vi.spyOn(process, 'cwd').mockReturnValue(makeProject(files));
    return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }

  function missingFileWarning(routerDir: string, target: string): string {
    return `[@sentry/nextjs] Could not find an instrumentation file next to your ${routerDir} directory. Next.js production builds only load it from there, so the Sentry SDK will not be initialized on the server. Create ${target}, or move your existing instrumentation file there: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#register-server-side-sdk (you can suppress this warning by setting SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING=1 as environment variable)`;
  }

  it.each([
    ['the file is in the project root with `src/app`', ROOT_FILE_WITH_SRC_APP, 'src/app', 'src/instrumentation.ts'],
    [
      'the file is in `src` with `app`',
      ['app/page.tsx', 'src/lib/db.ts', 'src/instrumentation.ts'],
      'app',
      'instrumentation.ts',
    ],
    ['there is no file with `src/pages`', ['src/pages/index.tsx'], 'src/pages', 'src/instrumentation.ts'],
    [
      'the file is next to `src/app`, but a root `pages` directory takes precedence',
      ['pages/index.tsx', 'src/app/page.tsx', 'src/instrumentation.ts'],
      'pages',
      'instrumentation.ts',
    ],
  ])('warns when %s', (_setup, files, routerDir, target) => {
    const warnSpy = setUp(files);

    warnIfMissingInstrumentationFile({}, {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(missingFileWarning(routerDir, target));
  });

  it('warns only once', () => {
    const warnSpy = setUp(ROOT_FILE_WITH_SRC_APP);

    warnIfMissingInstrumentationFile({}, {});
    warnIfMissingInstrumentationFile({}, {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the file is next to `src/app`', ['src/app/page.tsx', 'src/instrumentation.ts']],
    ['the file is next to `app`', ['app/page.tsx', 'instrumentation.js']],
    ['a file is in both folders', ['src/app/page.tsx', 'src/instrumentation.ts', 'instrumentation.ts']],
    ['the project has no `app` or `pages` directory', []],
  ])('does not warn when %s', (_setup, files) => {
    const warnSpy = setUp(files);

    warnIfMissingInstrumentationFile({}, {});

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('looks for the file with the configured `pageExtensions`', () => {
    const warnSpy = setUp(['src/app/page.page.tsx', 'src/instrumentation.page.ts']);

    warnIfMissingInstrumentationFile({ pageExtensions: ['page.tsx', 'page.ts'] }, {});

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn with `silent`', () => {
    const warnSpy = setUp(ROOT_FILE_WITH_SRC_APP);

    warnIfMissingInstrumentationFile({}, { silent: true });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING is set', () => {
    vi.stubEnv('SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING', '1');
    const warnSpy = setUp(ROOT_FILE_WITH_SRC_APP);

    warnIfMissingInstrumentationFile({}, {});

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
