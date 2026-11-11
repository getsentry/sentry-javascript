import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextConfigObject } from '../../../src/config/types';
import {
  findTunnelRouteHandlerFile,
  getTunnelRouteInjectedValues,
  setUpManagedTunnelVercelRoute,
} from '../../../src/config/withSentryConfig/tunnel';
import { makeProject, removeProjects } from './projectFixture';

const FIXED_PATH_REWRITE = { source: '/monitoring', destination: '/sentry-tunnel' };

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
  it('returns the fixed path with the basePath', () => {
    expect(getTunnelRouteInjectedValues({ basePath: '/docs' }, { tunnelRoute: '/monitoring' })).toEqual({
      _sentryTunnelRoute: '/docs/monitoring',
    });
  });

  it('returns `true` for the path derived from the DSN', () => {
    expect(getTunnelRouteInjectedValues({ basePath: '/docs' }, { tunnelRoute: true })).toEqual({
      _sentryTunnelRoute: 'true',
    });
  });

  it.each([
    ['`tunnelRoute` is not set', {}, {}],
    ['`tunnelRoute` is `false`', {}, { tunnelRoute: false }],
    ['`tunnelRoute` is an empty string', { basePath: '/docs' }, { tunnelRoute: '' }],
    ['the app is a static export', { output: 'export' }, { tunnelRoute: '/monitoring' }],
  ] as const)('returns no values when %s', (_description, nextConfig, sentryOptions) => {
    expect(getTunnelRouteInjectedValues(nextConfig, sentryOptions)).toEqual({});
  });
});

describe('setUpManagedTunnelVercelRoute', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    process.argv = [...originalArgv.slice(0, 2), 'build'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.argv = originalArgv;
  });

  function hasRouteFile(projectDir: string): boolean {
    return fs.readdirSync(projectDir, { recursive: true }).some(entry => String(entry).includes('route'));
  }

  it('writes the tunnel route handler and rewrites envelope requests to it', async () => {
    const projectDir = makeProject(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    setUpManagedTunnelVercelRoute(nextConfig, undefined, projectDir);

    expect(fs.readFileSync(path.join(projectDir, 'app/sentry-tunnel/route.js'), 'utf8')).toContain(
      "export { POST } from '@sentry/nextjs/tunnel';",
    );
    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      afterFiles: [expect.objectContaining({ destination: '/sentry-tunnel' })],
    });
  });

  it.each([
    ['an App Router page', 'app/sentry-tunnel/page.tsx'],
    ['an App Router page in `src`', 'src/app/sentry-tunnel/page.tsx'],
    ['a Pages Router page', 'pages/sentry-tunnel.tsx'],
    ['a Pages Router index page', 'src/pages/sentry-tunnel/index.js'],
  ])('does nothing when the project has %s at the route path', (_description, file) => {
    const projectDir = makeProject([file]);
    const nextConfig: NextConfigObject = {};

    setUpManagedTunnelVercelRoute(nextConfig, undefined, projectDir);

    expect(hasRouteFile(projectDir)).toBe(false);
    expect(nextConfig.rewrites).toBeUndefined();
  });

  it.each([
    ['outside of Vercel', () => vi.stubEnv('VERCEL', '')],
    ['in a Vercel development build', () => vi.stubEnv('VERCEL_ENV', 'development')],
    ['outside of `next build`', () => (process.argv = [...originalArgv.slice(0, 2), 'dev'])],
  ])('does nothing %s', (_description, setUp) => {
    setUp();
    const projectDir = makeProject(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    setUpManagedTunnelVercelRoute(nextConfig, undefined, projectDir);

    expect(hasRouteFile(projectDir)).toBe(false);
    expect(nextConfig.rewrites).toBeUndefined();
  });

  it('does nothing for a static export', () => {
    const projectDir = makeProject(['app/page.tsx']);
    const nextConfig: NextConfigObject = { output: 'export' };

    setUpManagedTunnelVercelRoute(nextConfig, undefined, projectDir);

    expect(hasRouteFile(projectDir)).toBe(false);
    expect(nextConfig.rewrites).toBeUndefined();
  });

  it('rewrites the `tunnelRoute` path to the tunnel route handler before files', async () => {
    const projectDir = makeProject(['app/page.tsx']);
    const nextConfig: NextConfigObject = {};

    setUpManagedTunnelVercelRoute(nextConfig, '/monitoring', projectDir);

    expect(fs.existsSync(path.join(projectDir, 'app/sentry-tunnel/route.js'))).toBe(true);
    await expect(nextConfig.rewrites?.()).resolves.toEqual({ beforeFiles: [FIXED_PATH_REWRITE], afterFiles: [] });
  });

  it('keeps the user rewrites in array form as `afterFiles`', async () => {
    const userRewrite = { source: '/blog/:slug', destination: '/news/:slug' };
    const nextConfig: NextConfigObject = { rewrites: async () => [userRewrite] };

    setUpManagedTunnelVercelRoute(nextConfig, '/monitoring', makeProject(['app/page.tsx']));

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [FIXED_PATH_REWRITE],
      afterFiles: [userRewrite],
    });
  });

  it('puts the `tunnelRoute` rewrite before the user `beforeFiles` rewrites', async () => {
    const userBeforeFilesRewrite = { source: '/old', destination: '/new' };
    const userFallbackRewrite = { source: '/:path*', destination: 'https://legacy.example.com/:path*' };
    const nextConfig: NextConfigObject = {
      rewrites: async () => ({ beforeFiles: [userBeforeFilesRewrite], fallback: [userFallbackRewrite] }),
    };

    setUpManagedTunnelVercelRoute(nextConfig, '/monitoring', makeProject(['app/page.tsx']));

    await expect(nextConfig.rewrites?.()).resolves.toEqual({
      beforeFiles: [FIXED_PATH_REWRITE, userBeforeFilesRewrite],
      fallback: [userFallbackRewrite],
    });
  });

  it('keeps the tunnel route handler of the app', () => {
    const projectDir = makeProject(['app/page.tsx', 'app/sentry-tunnel/route.ts']);

    setUpManagedTunnelVercelRoute({}, '/monitoring', projectDir);

    expect(fs.readFileSync(path.join(projectDir, 'app/sentry-tunnel/route.ts'), 'utf8')).toBe('');
    expect(fs.existsSync(path.join(projectDir, 'app/sentry-tunnel/route.js'))).toBe(false);
  });
});
