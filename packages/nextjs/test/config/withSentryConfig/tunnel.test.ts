import { afterEach, describe, expect, it } from 'vitest';
import type { NextConfigObject } from '../../../src/config/types';
import {
  findTunnelRouteHandlerFile,
  getTunnelRouteInjectedValues,
  setUpTunnelHandlerRewrite,
} from '../../../src/config/withSentryConfig/tunnel';
import { makeProject, removeProjects } from './projectFixture';

const HANDLER_REWRITE = { source: '/monitoring', destination: '/sentry-tunnel' };

afterEach(() => {
  removeProjects();
});

describe('findTunnelRouteHandlerFile', () => {
  it.each([
    ['app/sentry-tunnel/route.ts', ['app/page.tsx', 'app/sentry-tunnel/route.ts']],
    ['src/app/sentry-tunnel/route.js', ['src/app/page.tsx', 'src/app/sentry-tunnel/route.js']],
  ])('finds %s', (expectedFile, files) => {
    expect(findTunnelRouteHandlerFile(undefined, makeProject(files))).toBe(expectedFile);
  });

  // Next.js finds `pages` and `app` separately, so a root `pages` does not hide `src/app`, only `src/pages`
  // Next.js 16 rejects this case at build time.
  // https://github.com/vercel/next.js/blob/7a7d48862287fd5caecd99da41149ecbddf37320/packages/next/src/lib/find-pages-dir.ts#L4-L13
  it('finds the file in `src/app` next to a root `pages` directory', () => {
    const projectDir = makeProject(['pages/index.tsx', 'src/app/sentry-tunnel/route.ts']);

    expect(findTunnelRouteHandlerFile(undefined, projectDir)).toBe('src/app/sentry-tunnel/route.ts');
  });

  it('ignores `src/app` when there is a root `app` directory', () => {
    const projectDir = makeProject(['app/page.tsx', 'src/app/sentry-tunnel/route.ts']);

    expect(findTunnelRouteHandlerFile(undefined, projectDir)).toBeUndefined();
  });

  it('finds the file only with a whole `pageExtensions` entry', () => {
    const projectDir = makeProject(['app/sentry-tunnel/route.ts', 'app/sentry-tunnel/route.page.ts']);

    expect(findTunnelRouteHandlerFile(['page.ts'], projectDir)).toBe('app/sentry-tunnel/route.page.ts');
  });

  it('does not find a file that does not match any `pageExtensions` entry', () => {
    const projectDir = makeProject(['app/sentry-tunnel/route.ts']);

    expect(findTunnelRouteHandlerFile(['mdx', 'tsx'], projectDir)).toBeUndefined();
  });

  it.each([
    ['a route group', ['app/(monitoring)/sentry-tunnel/route.ts']],
    ['a Pages Router project', ['pages/sentry-tunnel/route.ts']],
    ['a directory named like the route file', ['app/sentry-tunnel/route.ts/page.tsx']],
  ])('does not find the file in %s', (_description, files) => {
    expect(findTunnelRouteHandlerFile(undefined, makeProject(files))).toBeUndefined();
  });
});

describe('getTunnelRouteInjectedValues', () => {
  it('returns the handler mode when the project has a tunnel route handler', () => {
    const projectDir = makeProject(['app/sentry-tunnel/route.ts']);

    expect(getTunnelRouteInjectedValues({}, { tunnelRoute: '/monitoring' }, projectDir)).toEqual({
      _sentryRewritesTunnelPath: '/monitoring',
      _sentryTunnelRouteMode: 'handler',
    });
  });

  it('returns the rewrite mode when the project has no tunnel route handler', () => {
    const projectDir = makeProject(['app/page.tsx']);

    expect(getTunnelRouteInjectedValues({}, { tunnelRoute: '/monitoring' }, projectDir)).toEqual({
      _sentryRewritesTunnelPath: '/monitoring',
      _sentryTunnelRouteMode: 'rewrite',
    });
  });

  it('adds the basePath to the tunnel path', () => {
    const projectDir = makeProject(['app/sentry-tunnel/route.ts']);

    expect(getTunnelRouteInjectedValues({ basePath: '/docs' }, { tunnelRoute: '/monitoring' }, projectDir)).toEqual({
      _sentryRewritesTunnelPath: '/docs/monitoring',
      _sentryTunnelRouteMode: 'handler',
    });
  });

  it.each([
    ['`tunnelRoute` is not set', {}, {}],
    ['`tunnelRoute` is an empty string', { basePath: '/docs' }, { tunnelRoute: '' }],
    ['`tunnelRoute` is still `true`', {}, { tunnelRoute: true }],
    ['the app is a static export', { output: 'export' }, { tunnelRoute: '/monitoring' }],
  ])('returns no values when %s', (_description, nextConfig, sentryOptions) => {
    const projectDir = makeProject(['app/sentry-tunnel/route.ts']);

    expect(getTunnelRouteInjectedValues(nextConfig, sentryOptions, projectDir)).toEqual({});
  });
});

describe('setUpTunnelHandlerRewrite', () => {
  it('adds the handler rewrite to `beforeFiles` when there are no user rewrites', async () => {
    const nextConfig: NextConfigObject = {};

    setUpTunnelHandlerRewrite(nextConfig, '/monitoring');

    await expect(nextConfig.rewrites?.()).resolves.toEqual({ beforeFiles: [HANDLER_REWRITE], afterFiles: [] });
  });

  it('keeps user rewrites in array form as `afterFiles`', async () => {
    const userRewrite = { source: '/blog/:slug', destination: '/news/:slug' };
    const nextConfig: NextConfigObject = { rewrites: async () => [userRewrite] };

    setUpTunnelHandlerRewrite(nextConfig, '/monitoring');

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [HANDLER_REWRITE],
      afterFiles: [userRewrite],
    });
  });

  it('puts the handler rewrite before the user `beforeFiles` rewrites', async () => {
    const userBeforeFilesRewrite = { source: '/old', destination: '/new' };
    const userFallbackRewrite = { source: '/:path*', destination: 'https://legacy.example.com/:path*' };
    const nextConfig: NextConfigObject = {
      rewrites: async () => ({ beforeFiles: [userBeforeFilesRewrite], fallback: [userFallbackRewrite] }),
    };

    setUpTunnelHandlerRewrite(nextConfig, '/monitoring');

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [HANDLER_REWRITE, userBeforeFilesRewrite],
      fallback: [userFallbackRewrite],
    });
  });
});
