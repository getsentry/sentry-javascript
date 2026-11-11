import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextConfigObject } from '../../../src/config/types';
import { warnIfMissingInstrumentationFile } from '../../../src/config/withSentryConfig/getFinalConfigObjectUtils';
import { makeProject, removeProjects } from './projectFixture';

const TUNNEL_REWRITE = {
  source: '/:path*',
  has: [{ type: 'header', key: 'content-type', value: 'application/x-sentry-envelope' }],
  destination: '/sentry-tunnel',
};

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

  const originalArgv = process.argv;

  beforeEach(() => {
    vi.restoreAllMocks();
    // A fresh module per test, because the function logs each message only once.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.argv = originalArgv;
  });

  async function setUp(files: string[]) {
    vi.spyOn(process, 'cwd').mockReturnValue(makeProject(files));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { maybeSetUpTunnelRouteRewriteRules } =
      await import('../../../src/config/withSentryConfig/getFinalConfigObjectUtils');
    return { maybeSetUpTunnelRouteRewriteRules, logSpy, warnSpy };
  }

  function stubVercelBuild(): void {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    process.argv = [...originalArgv.slice(0, 2), 'build'];
  }

  it('sets up no rewrite outside of Vercel and warns once about the deprecated option', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, warnSpy } = await setUp(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: '/monitoring' });
    maybeSetUpTunnelRouteRewriteRules({}, { tunnelRoute: '/monitoring' });

    expect(nextConfig.rewrites).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('The `tunnelRoute` option is deprecated'));
  });

  it.each([
    ['`tunnelRoute` is not set', {}],
    ['`tunnelRoute` is `true`', { tunnelRoute: true }],
    ['`tunnelRoute` is a path', { tunnelRoute: '/monitoring' }],
  ])(
    'rewrites envelope requests to the tunnel route handler on Vercel when %s',
    async (_description, sentryOptions) => {
      stubVercelBuild();
      const { maybeSetUpTunnelRouteRewriteRules } = await setUp(['app/page.tsx']);
      const nextConfig: NextConfigObject = {};

      maybeSetUpTunnelRouteRewriteRules(nextConfig, sentryOptions);

      await expect(nextConfig.rewrites?.()).resolves.toEqual({ afterFiles: [TUNNEL_REWRITE] });
    },
  );

  it('does not warn about the deprecated option when `tunnelRoute` is not set', async () => {
    const { maybeSetUpTunnelRouteRewriteRules, warnSpy } = await setUp(['app/page.tsx']);

    maybeSetUpTunnelRouteRewriteRules({}, {});

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sets up no rewrite on Vercel when `tunnelRoute` is `false`', async () => {
    stubVercelBuild();
    const { maybeSetUpTunnelRouteRewriteRules } = await setUp(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: false });

    expect(nextConfig.rewrites).toBeUndefined();
  });

  it('sets up no rewrite for a static export and warns that `tunnelRoute` does not work there', async () => {
    stubVercelBuild();
    const { maybeSetUpTunnelRouteRewriteRules, warnSpy } = await setUp(['app/page.tsx']);
    const nextConfig: NextConfigObject = { output: 'export' };

    maybeSetUpTunnelRouteRewriteRules(nextConfig, { tunnelRoute: '/monitoring' });

    expect(nextConfig.rewrites).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('The `tunnelRoute` option is deprecated'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('will not work in combination with Next.js static exports'),
    );
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
