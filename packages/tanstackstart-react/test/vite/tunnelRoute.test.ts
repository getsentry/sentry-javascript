import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { injectManagedTunnelRoute, makeTunnelRoutePlugin, resolveTunnelRoute } from '../../src/vite/tunnelRoute';

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
    delete process.env.__SENTRY_INTERNAL_TANSTACKSTART_TUNNEL_ROUTE__;
  });

  afterEach(() => {
    delete process.env.__SENTRY_INTERNAL_TANSTACKSTART_TUNNEL_ROUTE__;
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
      path: '/monitor',
    });

    expect(plugin.config && plugin.config()).toEqual({
      define: {
        __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: '"/monitor"',
      },
    });

    expect(plugin.resolveId && plugin.resolveId('virtual:sentry-tanstackstart-react/tunnel-route')).toBe(
      '\0virtual:sentry-tanstackstart-react/tunnel-route',
    );

    const virtualRouteModule = plugin.load && (await plugin.load('\0virtual:sentry-tanstackstart-react/tunnel-route'));

    expect(virtualRouteModule).toContain('createFileRoute("/monitor")');
    expect(virtualRouteModule).toContain('allowedDsns: ["http://public@localhost:3031/1337"]');
  });

  it('omits allowedDsns from the virtual managed tunnel route module when not provided', async () => {
    const plugin = makeTunnelRoutePlugin('/monitor');

    const virtualRouteModule = plugin.load && (await plugin.load('\0virtual:sentry-tanstackstart-react/tunnel-route'));

    expect(virtualRouteModule).toContain('createFileRoute("/monitor")');
    expect(virtualRouteModule).toContain('createSentryTunnelRoute({})');
  });

  it('treats an empty string `path` like omitted and uses a generated tunnel route', () => {
    const plugin = makeTunnelRoutePlugin({ path: '' });

    const defined = plugin.config && plugin.config();
    const serialized = defined?.define?.__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__;
    expect(typeof serialized).toBe('string');
    expect(serialized).toMatch(/^"\/[a-z0-9]{8}"$/);
  });
});
