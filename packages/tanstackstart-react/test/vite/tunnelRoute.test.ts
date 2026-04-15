import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { injectManagedTunnelRoute, makeTunnelRoutePlugin, resolveTunnelRoute } from '../../src/vite/tunnelRoute';

const MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY = '__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__';

const ROUTE_TREE_SOURCE = `import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
`;

const UNTYPED_ROUTE_TREE_SOURCE = ROUTE_TREE_SOURCE.replace(
  'const rootRouteChildren: RootRouteChildren = {',
  'const rootRouteChildren = {',
);

describe('tunnelRoute vite plugin', () => {
  beforeEach(() => {
    delete process.env[MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY];
  });

  afterEach(() => {
    delete process.env[MANAGED_TUNNEL_ROUTE_PATH_ENV_KEY];
  });

  it('reuses the same generated tunnel route within one process', () => {
    const firstTunnelRoute = resolveTunnelRoute(true);
    const secondTunnelRoute = resolveTunnelRoute(true);

    expect(firstTunnelRoute).toBe(secondTunnelRoute);
    expect(firstTunnelRoute).toMatch(/^\/[a-z0-9]{8}$/);
  });

  it('always generates an 8-character tunnel route', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(resolveTunnelRoute(true)).toBe('/iiiiiiii');
  });

  it('returns the provided static tunnel route without reusing a generated one', () => {
    resolveTunnelRoute(true);

    expect(resolveTunnelRoute('/monitor')).toBe('/monitor');
  });

  it('rejects empty allowedDsns', () => {
    expect(() => makeTunnelRoutePlugin({ allowedDsns: [] })).toThrow(
      '`sentryTanstackStart({ tunnelRoute })` requires at least one allowed DSN',
    );
  });

  it('rejects invalid static tunnel routes', () => {
    expect(() => makeTunnelRoutePlugin({ allowedDsns: ['https://public@o0.ingest.sentry.io/0'], tunnel: 'monitor' })).toThrow(
      '`tunnelRoute.tunnel` must be `true` or an absolute route path',
    );
  });

  it('injects the managed tunnel route into the generated TanStack route tree', () => {
    const transformedRouteTree = injectManagedTunnelRoute(ROUTE_TREE_SOURCE, '/monitor');

    expect(transformedRouteTree).toContain(
      "import { Route as SentryManagedTunnelRouteImport } from 'virtual:sentry-tanstackstart-react/tunnel-route'",
    );
    expect(transformedRouteTree).toContain('const SentryManagedTunnelRoute = SentryManagedTunnelRouteImport.update({');
    expect(transformedRouteTree).toContain('id: "/monitor"');
    expect(transformedRouteTree).toContain('path: "/monitor"');
    expect(transformedRouteTree).toContain('SentryManagedTunnelRoute: SentryManagedTunnelRoute,');
    expect(transformedRouteTree).toContain('IndexRoute: IndexRoute,');
  });

  it('injects the managed tunnel route when rootRouteChildren is untyped', () => {
    const transformedRouteTree = injectManagedTunnelRoute(UNTYPED_ROUTE_TREE_SOURCE, '/monitor');

    expect(transformedRouteTree).toContain('const rootRouteChildren = {');
    expect(transformedRouteTree).toContain('SentryManagedTunnelRoute: SentryManagedTunnelRoute,');
  });

  it('fails when the managed tunnel route conflicts with an existing route', () => {
    expect(() => injectManagedTunnelRoute(ROUTE_TREE_SOURCE, '/')).toThrow(
      'Cannot register managed tunnel route "/" because an existing TanStack Start route already uses that path.',
    );
  });

  it('loads a virtual managed tunnel route module for a static tunnel path', async () => {
    const plugin = makeTunnelRoutePlugin({
      allowedDsns: ['http://public@localhost:3031/1337'],
      tunnel: '/monitor',
    });

    expect(plugin.config && plugin.config()).toEqual({
      define: {
        __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: '"/monitor"',
      },
    });

    expect(plugin.resolveId && plugin.resolveId('virtual:sentry-tanstackstart-react/tunnel-route')).toBe(
      '\0virtual:sentry-tanstackstart-react/tunnel-route',
    );

    const virtualRouteModule =
      plugin.load && (await plugin.load('\0virtual:sentry-tanstackstart-react/tunnel-route'));

    expect(virtualRouteModule).toContain('createFileRoute("/monitor")');
    expect(virtualRouteModule).toContain('allowedDsns: ["http://public@localhost:3031/1337"]');
  });
});
