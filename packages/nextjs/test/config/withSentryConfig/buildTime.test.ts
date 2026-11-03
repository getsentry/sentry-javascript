import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { setUpBuildTimeVariables } from '../../../src/config/withSentryConfig/buildTime';

const tmpDirs: string[] = [];

function makeProject(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nextjs-build-time-'));
  tmpDirs.push(dir);
  for (const file of files) {
    const absolute = path.join(dir, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('setUpBuildTimeVariables', () => {
  describe('_sentryHasPagesRouter', () => {
    it('is set to "false" for a project that only has App Router pages', () => {
      const nextConfig = {};

      setUpBuildTimeVariables(nextConfig, {}, undefined, makeProject(['app/page.tsx', 'pages/api/hello.ts']));

      expect(nextConfig).toEqual({ env: expect.objectContaining({ _sentryHasPagesRouter: 'false' }) });
    });

    it('is left unset for a project with Pages Router pages', () => {
      const nextConfig = {};

      setUpBuildTimeVariables(nextConfig, {}, undefined, makeProject(['app/page.tsx', 'pages/index.tsx']));

      expect(nextConfig).toEqual({ env: expect.not.objectContaining({ _sentryHasPagesRouter: expect.anything() }) });
    });

    it('is left unset when the project layout cannot be determined', () => {
      const nextConfig = {};

      setUpBuildTimeVariables(nextConfig, {}, undefined, makeProject(['package.json']));

      expect(nextConfig).toEqual({ env: expect.not.objectContaining({ _sentryHasPagesRouter: expect.anything() }) });
    });

    it('does not override a value the user set themselves', () => {
      const nextConfig = { env: { _sentryHasPagesRouter: 'true' } };

      setUpBuildTimeVariables(nextConfig, {}, undefined, makeProject(['app/page.tsx']));

      expect(nextConfig.env._sentryHasPagesRouter).toBe('true');
    });
  });

  describe('tunnel route', () => {
    it('adds the tunnel path and the handler mode for a project with a tunnel route handler', () => {
      const nextConfig = { basePath: '/docs' };

      setUpBuildTimeVariables(
        nextConfig,
        { tunnelRoute: '/monitoring' },
        undefined,
        makeProject(['app/sentry-tunnel/route.ts']),
      );

      expect(nextConfig).toEqual({
        basePath: '/docs',
        env: expect.objectContaining({
          _sentryRewritesTunnelPath: '/docs/monitoring',
          _sentryTunnelRouteMode: 'handler',
        }),
      });
    });
  });
});

describe('_sentryCacheComponents', () => {
  it('is set when the Next.js config enables cacheComponents', () => {
    const config: NextConfigObject = { cacheComponents: true };
    setUpBuildTimeVariables(config, {}, undefined);
    expect(config.env?._sentryCacheComponents).toBe('true');
  });

  it('is left unset otherwise', () => {
    const config: NextConfigObject = {};
    setUpBuildTimeVariables(config, {}, undefined);
    expect(config.env?._sentryCacheComponents).toBeUndefined();
  });
});
