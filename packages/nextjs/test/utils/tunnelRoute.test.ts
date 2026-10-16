import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BrowserOptions } from '@sentry/react';
import { getTunnelPath } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTunnelRouteOption } from '../../src/client/tunnelRoute';
import { isTunnelRequest } from '../../src/common/isTunnelRequest';
import { sentryTunnelRouteHandler } from '../../src/common/sentryTunnelRouteHandler';
import {
  ensureTunnelRouteFile,
  getManagedTunnelOptions,
  setUpTunnelRewriteRules,
} from '../../src/config/withSentryConfig/tunnel';
import type { NextConfigObject } from '../../src/config/types';

const globalWithInjectedValues = global as typeof global & {
  _sentryManagedTunnel?: unknown;
};

afterEach(() => {
  delete globalWithInjectedValues._sentryManagedTunnel;
});

describe('applyTunnelRouteOption()', () => {
  it('applies the injected tunnel options', () => {
    globalWithInjectedValues._sentryManagedTunnel = { basePath: '/base' };
    const options: BrowserOptions = { dsn: 'https://public@o1.ingest.sentry.io/1' };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toEqual({ basePath: '/base' });
  });

  it('keeps a `tunnel` the user set', () => {
    globalWithInjectedValues._sentryManagedTunnel = { basePath: '' };
    const options: BrowserOptions = { tunnel: '/my-tunnel' };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/my-tunnel');
  });

  it('leaves `tunnel` unset without `tunnelRoute`', () => {
    const options: BrowserOptions = {};

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });
});

describe('getManagedTunnelOptions()', () => {
  it('derives the path from the DSN for `true` and keeps a string path', () => {
    expect(getManagedTunnelOptions({ basePath: '/base' }, true)).toEqual({ basePath: '/base' });
    expect(getManagedTunnelOptions({}, '/monitoring')).toEqual({ basePath: '', path: '/monitoring' });
  });

  it('keeps the path and allowed DSNs of an options object', () => {
    const allowedDsns = ['https://browser@o1.ingest.sentry.io/1'];

    expect(getManagedTunnelOptions({}, { allowedDsns })).toEqual({ basePath: '', allowedDsns });
    expect(getManagedTunnelOptions({}, { path: '/monitoring', allowedDsns })).toEqual({
      basePath: '',
      path: '/monitoring',
      allowedDsns,
    });
  });

  it('is off without `tunnelRoute` and for static exports', () => {
    expect(getManagedTunnelOptions({}, undefined)).toBeUndefined();
    expect(getManagedTunnelOptions({}, false)).toBeUndefined();
    expect(getManagedTunnelOptions({ output: 'export' }, true)).toBeUndefined();
  });
});

describe('sentryTunnelRouteHandler()', () => {
  const BROWSER_DSN = 'https://browser@o1.ingest.sentry.io/1';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function tunnelRequest(dsn: string): Request {
    return new Request(`http://localhost/sentry-tunnel?p=${getTunnelPath(dsn)!.slice(1)}`, {
      method: 'POST',
      body: `${JSON.stringify({ dsn })}\n`,
    });
  }

  it('forwards envelopes for the allowed DSNs of `tunnelRoute`', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    globalWithInjectedValues._sentryManagedTunnel = { basePath: '', allowedDsns: [BROWSER_DSN] };

    const response = await sentryTunnelRouteHandler(tunnelRequest(BROWSER_DSN));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://o1.ingest.sentry.io/api/1/envelope/'),
      expect.anything(),
    );
  });

  it('rejects envelopes for a DSN that is not allowed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    globalWithInjectedValues._sentryManagedTunnel = { basePath: '', allowedDsns: [BROWSER_DSN] };

    const response = await sentryTunnelRouteHandler(tunnelRequest('https://other@o1.ingest.sentry.io/2'));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('isTunnelRequest()', () => {
  it('matches POSTs to the tunnel of the injected options', () => {
    globalWithInjectedValues._sentryManagedTunnel = { basePath: '/base', path: '/monitoring' };

    expect(isTunnelRequest({ method: 'POST', url: 'http://localhost/base/monitoring' })).toBe(true);
    expect(isTunnelRequest({ method: 'GET', url: 'http://localhost/base/monitoring' })).toBe(false);
    expect(isTunnelRequest({ method: 'POST', url: 'http://localhost/base/admin' })).toBe(false);
  });

  it('matches nothing without `tunnelRoute`', () => {
    expect(isTunnelRequest({ method: 'POST', url: 'http://localhost/monitoring' })).toBe(false);
  });
});

describe('setUpTunnelRewriteRules()', () => {
  it('rewrites envelope POSTs on a single segment to the tunnel route for a DSN-derived path', async () => {
    const config: NextConfigObject = {};
    setUpTunnelRewriteRules(config, { basePath: '' });

    expect(await config.rewrites!()).toEqual({
      beforeFiles: [
        {
          source: '/:sentryTunnelPath',
          has: [{ type: 'header', key: 'content-type', value: 'application/x-sentry-envelope' }],
          destination: '/sentry-tunnel?p=:sentryTunnelPath',
        },
      ],
      afterFiles: [],
      fallback: [],
    });
  });

  it('rewrites a fixed path and keeps the user rewrites', async () => {
    const userRewrite = { source: '/old', destination: '/new' };
    const config: NextConfigObject = { rewrites: async () => [userRewrite] };
    setUpTunnelRewriteRules(config, { basePath: '', path: '/api/monitor' });

    expect(await config.rewrites!()).toEqual({
      beforeFiles: [{ source: '/api/monitor(/?)', destination: '/sentry-tunnel?p=api%2Fmonitor' }],
      afterFiles: [userRewrite],
      fallback: [],
    });
  });
});

describe('ensureTunnelRouteFile()', () => {
  const projectDirs: string[] = [];

  function makeProjectDir(...dirs: string[]): string {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nextjs-tunnel-'));
    projectDirs.push(projectDir);
    dirs.forEach(dir => fs.mkdirSync(path.join(projectDir, dir), { recursive: true }));
    return projectDir;
  }

  afterEach(() => {
    projectDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
  });

  it('creates the route in `app` and leaves an existing one alone', () => {
    const projectDir = makeProjectDir('app');
    fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), '{}');

    const routeFile = ensureTunnelRouteFile(projectDir);

    expect(routeFile).toBe(path.join(projectDir, 'app', 'sentry-tunnel', 'route.ts'));
    expect(fs.readFileSync(routeFile!, 'utf8')).toContain("export { POST } from '@sentry/nextjs/tunnel';");
    expect(ensureTunnelRouteFile(projectDir)).toBeUndefined();
  });

  it('uses `src/app` in a `src` layout and JavaScript without a tsconfig', () => {
    const projectDir = makeProjectDir('src/pages');

    expect(ensureTunnelRouteFile(projectDir)).toBe(path.join(projectDir, 'src', 'app', 'sentry-tunnel', 'route.js'));
  });

  it('uses the root `app` when the root has `pages`, as Next.js then ignores `src`', () => {
    const projectDir = makeProjectDir('pages', 'src/utils');

    expect(ensureTunnelRouteFile(projectDir)).toBe(path.join(projectDir, 'app', 'sentry-tunnel', 'route.js'));
  });
});
