import type { Client } from '@sentry/core';
import { getCurrentScope, getTunnelPath, makeDsn } from '@sentry/core';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  makeServerEntryTunnelPlugin,
  makeTunnelBasePathPlugin,
  makeTunnelRoutePlugin,
  normalizeTunnelRouteOptions,
} from '../../src/vite/tunnelRoute';

describe('tunnelRoute vite plugin', () => {
  it('maps `tunnelRoute` onto the `tunnel` init options', () => {
    expect(normalizeTunnelRouteOptions(true)).toEqual({});
    expect(normalizeTunnelRouteOptions('/monitor')).toEqual({ path: '/monitor' });
    expect(normalizeTunnelRouteOptions({ path: '', allowedDsns: [] })).toEqual({
      path: undefined,
      allowedDsns: undefined,
    });
    expect(
      normalizeTunnelRouteOptions({ path: '/monitor', allowedDsns: ['https://public@o0.ingest.sentry.io/0'] }),
    ).toEqual({ path: '/monitor', allowedDsns: ['https://public@o0.ingest.sentry.io/0'] });
  });

  it('rejects invalid static tunnel routes', () => {
    expect(() => makeTunnelRoutePlugin('monitor')).toThrow(
      'static paths must start with `/` and must not contain query or hash segments',
    );
    expect(() => makeTunnelRoutePlugin('/monitor?x=1')).toThrow(
      'static paths must start with `/` and must not contain query or hash segments',
    );
    expect(() => makeTunnelRoutePlugin({ path: 'monitor' })).toThrow(
      'static paths must start with `/` and must not contain query or hash segments',
    );
  });

  it('tells the client the static path, or that the path comes from the DSN', () => {
    const staticPlugin = makeTunnelRoutePlugin({ path: '/monitor' });
    const dsnPlugin = makeTunnelRoutePlugin(true);

    expect(staticPlugin.config && staticPlugin.config()).toEqual({
      define: { __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: '"/monitor"' },
    });
    expect(dsnPlugin.config && dsnPlugin.config()).toEqual({
      define: { __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: 'true' },
    });
  });

  it('fails when a static tunnel route conflicts with an existing route', () => {
    const transform = (path: string, source: string): unknown =>
      (makeTunnelRoutePlugin(path).transform as (source: string, id: string) => unknown)(
        source,
        '/app/src/routeTree.gen.ts',
      );
    const singleQuoted = "const MonitorRoute = MonitorRouteImport.update({\n  id: '/monitor',\n  path: '/monitor',";
    const doubleQuoted = singleQuoted.replace(/'/g, '"');

    expect(() => transform('/monitor', singleQuoted)).toThrow(
      'Cannot register managed tunnel route "/monitor" because an existing TanStack Start route already uses that path.',
    );
    expect(() => transform('/monitor', doubleQuoted)).toThrow('already uses that path');
    expect(transform('/other', singleQuoted)).toBeNull();
    expect(
      (makeTunnelRoutePlugin(true).transform as (s: string, id: string) => unknown)(
        singleQuoted,
        '/app/src/routeTree.gen.ts',
      ),
    ).toBeNull();
  });
});

describe('server entry tunnel vite plugin', () => {
  const USER_ENTRY = '/app/src/server.ts';

  function setup(
    tunnelRoute?: Parameters<typeof makeServerEntryTunnelPlugin>[0],
    basePath = '',
  ): (id: string) => unknown {
    const plugin = makeServerEntryTunnelPlugin(tunnelRoute, () => basePath);
    const config = {
      resolve: { alias: [{ find: 'virtual:tanstack-start-server-entry', replacement: USER_ENTRY }] },
    } as unknown as ResolvedConfig;
    (plugin.configResolved as (config: ResolvedConfig) => void)(config);

    return id => (plugin.load as Extract<Plugin['load'], (...args: never[]) => unknown>).call({} as never, id);
  }

  it('wraps the app server entry and the default entry', () => {
    const load = setup();

    expect(load(USER_ENTRY)).toContain('export default wrapServerEntryWithSentryTunnel(entry, undefined, "");');
    expect(load(`${USER_ENTRY}?sentry-tunnel-original`)).toBeNull();
    expect(load('/app/node_modules/@tanstack/react-start/dist/default-entry/esm/server.js')).toContain(
      'wrapServerEntryWithSentryTunnel',
    );
    expect(load('C:\\app\\node_modules\\@tanstack\\react-start\\dist\\plugin\\default-entry\\server.ts')).toContain(
      'wrapServerEntryWithSentryTunnel',
    );
    expect(load('/app/src/routes/index.tsx')).toBeNull();
  });

  it('re-exports everything from the original server entry', () => {
    const load = setup();

    expect(load(USER_ENTRY)).toContain(`export * from "${USER_ENTRY}?sentry-tunnel-original";`);
  });

  it('passes the build-time options when `tunnelRoute` derives the path from the DSN', () => {
    expect(setup(true)(USER_ENTRY)).toContain('wrapServerEntryWithSentryTunnel(entry, {}, "");');
    expect(setup({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'] })(USER_ENTRY)).toContain(
      'wrapServerEntryWithSentryTunnel(entry, {"allowedDsns":["https://public@o0.ingest.sentry.io/0"]}, "");',
    );
  });

  it('serves a static `tunnelRoute` path from the wrapper too', () => {
    expect(setup('/monitor')(USER_ENTRY)).toContain('wrapServerEntryWithSentryTunnel(entry, {"path":"/monitor"}, "");');
  });

  it('passes the base path Start routes on to the wrapper', () => {
    expect(setup(undefined, '/app')(USER_ENTRY)).toContain(
      'wrapServerEntryWithSentryTunnel(entry, undefined, "/app");',
    );
  });
});

describe('tunnel base path vite plugin', () => {
  function resolve(config: UserConfig): { define: unknown; basePath: string } {
    const { plugin, getBasePath } = makeTunnelBasePathPlugin();
    const result = (plugin.config as (config: UserConfig) => { define: unknown })(config);

    return { define: result.define, basePath: getBasePath() };
  }

  it('reads the base path Start defines for every environment', () => {
    expect(resolve({ define: { 'process.env.TSS_ROUTER_BASEPATH': JSON.stringify('/app/') } })).toEqual({
      define: { __SENTRY_TANSTACKSTART_TUNNEL_BASE_PATH__: '"/app"' },
      basePath: '/app',
    });
  });

  it("falls back to Vite's `base`, ignoring an absolute one", () => {
    expect(resolve({ base: '/my-app/' }).basePath).toBe('/my-app');
    expect(resolve({ base: 'https://cdn.example.com/assets/' }).basePath).toBe('');
  });

  it('serves the tunnel from the root without a base path', () => {
    expect(resolve({ define: { 'process.env.TSS_ROUTER_BASEPATH': JSON.stringify('/') } }).basePath).toBe('');
    expect(resolve({}).basePath).toBe('');
  });
});

describe('server entry tunnel vite plugin in `vite dev`', () => {
  const DSN = 'https://public@o1.ingest.sentry.io/1337';

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  function setClient(managedTunnel: object | undefined): Record<string, unknown> {
    const options = { dsn: DSN, _managedTunnel: managedTunnel, ignoreSpans: [] as unknown[] };
    getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);

    return options;
  }

  it("drops the dev server's spans for a `tunnelRoute` under the base path", () => {
    const options = setClient(undefined);
    const plugin = makeServerEntryTunnelPlugin(true, () => '/app');

    (plugin.configureServer as () => void)();

    const [filter] = options.ignoreSpans as { attributes: Record<string, RegExp> }[];
    expect(filter?.attributes['url.path']?.test(`/app${getTunnelPath(DSN)}`)).toBe(true);
  });

  it("serves the dev server's managed tunnel from `init` under the base path", () => {
    const options = setClient({});
    const plugin = makeServerEntryTunnelPlugin(undefined, () => '/app');

    (plugin.configureServer as () => void)();

    expect(options._managedTunnel).toEqual({ basePath: '/app' });
  });
});
