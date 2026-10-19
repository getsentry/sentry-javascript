import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextConfigObject } from '../../../src/config/types';
import { makeProject, removeProjects } from './projectFixture';

const HANDLER_REWRITE = { source: '/monitoring', destination: '/sentry-tunnel' };

afterEach(() => {
  removeProjects();
});

describe('maybeSetUpTunnelRouteRewriteRules', () => {
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
