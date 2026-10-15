import type { Plugin, ResolvedConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  makeServerEntryTunnelPlugin,
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
});

describe('server entry tunnel vite plugin', () => {
  const USER_ENTRY = '/app/src/server.ts';

  function setup(tunnelRoute?: Parameters<typeof makeServerEntryTunnelPlugin>[0]): (id: string) => unknown {
    const plugin = makeServerEntryTunnelPlugin(tunnelRoute);
    const config = {
      resolve: { alias: [{ find: 'virtual:tanstack-start-server-entry', replacement: USER_ENTRY }] },
    } as unknown as ResolvedConfig;
    (plugin.configResolved as (config: ResolvedConfig) => void)(config);

    return id => (plugin.load as Extract<Plugin['load'], (...args: never[]) => unknown>).call({} as never, id);
  }

  it('wraps the app server entry and the default entry', () => {
    const load = setup();

    expect(load(USER_ENTRY)).toContain('export default wrapServerEntryWithSentryTunnel(entry, undefined);');
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
    expect(setup(true)(USER_ENTRY)).toContain('wrapServerEntryWithSentryTunnel(entry, {});');
    expect(setup({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'] })(USER_ENTRY)).toContain(
      'wrapServerEntryWithSentryTunnel(entry, {"allowedDsns":["https://public@o0.ingest.sentry.io/0"]});',
    );
  });

  it('serves a static `tunnelRoute` path from the wrapper too', () => {
    expect(setup('/monitor')(USER_ENTRY)).toContain('wrapServerEntryWithSentryTunnel(entry, {"path":"/monitor"});');
  });
});
