import type { ServerTunnelOptions } from '@sentry/core';
import { _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath } from '@sentry/core';
import {
  _INTERNAL_forwardTunnelRequest as forwardTunnelRequest,
  _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults,
} from '@sentry/core/server';
import type { Plugin } from 'vite';

export type TunnelRouteOptions =
  | true
  | string
  | {
      /**
       * A list of DSNs that are allowed to use the managed tunnel route.
       *
       * If omitted or empty, the tunnel route will derive the allowed DSN from the active server Sentry SDK at runtime.
       */
      allowedDsns?: string[];

      /**
       * Controls the public route path used by the managed tunnel route.
       *
       * If omitted, the path is derived from the DSN at runtime, the same way `Sentry.init({ tunnel: true })` does.
       */
      path?: string;
    };

function validateStaticPath(path: string): void {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new Error(
      '[@sentry/tanstackstart-react] `tunnelRoute` static paths must start with `/` and must not contain query or hash segments.',
    );
  }
}

/**
 * Maps `tunnelRoute` onto the options `serveTunnelIntegration` takes, so both are served the same way.
 */
export function normalizeTunnelRouteOptions(options: TunnelRouteOptions): ServerTunnelOptions {
  if (options === true) {
    return {};
  }

  if (typeof options === 'string') {
    validateStaticPath(options);

    return { path: options };
  }

  if (options.path) {
    validateStaticPath(options.path);
  }

  return {
    path: options.path || undefined,
    allowedDsns: options.allowedDsns?.length ? options.allowedDsns : undefined,
  };
}

// `routeTree.gen.ts` quote style follows `tsr.config.json#quoteStyle` (`single` | `double`),
// so we check both forms for each route-identifying key.
const ROUTE_CONFLICT_KEYS = ['fullPath', 'path', 'id'] as const;

function hasRouteConflict(source: string, tunnelPath: string): boolean {
  const literals = [`'${tunnelPath}'`, `"${tunnelPath}"`];
  return ROUTE_CONFLICT_KEYS.some(key => literals.some(literal => source.includes(`${key}: ${literal}`)));
}

/**
 * Tells the client SDK which tunnel to use. The server entry wrapper serves it.
 */
export function makeTunnelRoutePlugin(options: TunnelRouteOptions, debug?: boolean): Plugin {
  const { path } = normalizeTunnelRouteOptions(options);

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(`[@sentry/tanstackstart-react] Tunnel route: ${path ?? 'derived from the DSN'}`);
  }

  return {
    name: 'sentry-tanstackstart-tunnel-route',
    config() {
      return { define: { __SENTRY_TANSTACKSTART_TUNNEL_ROUTE__: path ? JSON.stringify(path) : 'true' } };
    },
    // The server entry wrapper answers POSTs to a fixed path before Start's routing, so an app route on that path
    // would silently lose them.
    transform(source, id) {
      if (path && /[\\/]routeTree\.gen\.ts$/.test(id) && hasRouteConflict(source, path)) {
        throw new Error(
          `[@sentry/tanstackstart-react] Cannot register managed tunnel route "${path}" because an existing TanStack Start route already uses that path.`,
        );
      }

      return null;
    },
  };
}

const START_BASE_PATH_DEFINE = 'process.env.TSS_ROUTER_BASEPATH';

/**
 * Reads the base path TanStack Start routes on and hands it to the client SDK and the server entry wrapper, so the
 * managed tunnel is served under it without the user repeating it. Start resolves it from `router.basepath`, or from
 * Vite's `base`, and defines it for every environment. This runs after Start's own `config` hook to see that define.
 */
export function makeTunnelBasePathPlugin(): { plugin: Plugin; getBasePath: () => string } {
  let basePath = '';

  const plugin: Plugin = {
    name: 'sentry-tanstackstart-tunnel-base-path',
    enforce: 'post',
    config(config) {
      const startBasePath = config.define?.[START_BASE_PATH_DEFINE];
      basePath = normalizeTunnelBasePath(
        typeof startBasePath === 'string' ? parseDefine(startBasePath) : getRouterBasePathFromViteBase(config.base),
      );

      return { define: { __SENTRY_TANSTACKSTART_TUNNEL_BASE_PATH__: JSON.stringify(basePath) } };
    },
  };

  return { plugin, getBasePath: () => basePath };
}

function parseDefine(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);

    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Start's own fallback when `router.basepath` isn't set: an absolute (CDN) `base` doesn't move the app's routes.
function getRouterBasePathFromViteBase(base: string | undefined): string | undefined {
  return base && !/^[a-z][a-z\d+.-]*:/i.test(base) && !base.startsWith('//') ? base : undefined;
}

const SDK_PACKAGE = '@sentry/tanstackstart-react';
const SERVER_ENTRY_ALIAS = 'virtual:tanstack-start-server-entry';
const ORIGINAL_SERVER_ENTRY_QUERY = '?sentry-tunnel-original';
// The default entry is used directly when the app has no `src/server.ts`, and by Cloudflare's `main`.
const DEFAULT_SERVER_ENTRY = /\/react-start\/dist\/(?:plugin\/)?default-entry\/(?:esm\/)?server\.[jt]s$/;

/**
 * Wraps the TanStack Start server entry so tunnel requests are answered before Start's own request middleware and
 * routing. It does nothing unless the managed tunnel is enabled, either here via `tunnelRoute` or at runtime via
 * `Sentry.init({ tunnel: true })`.
 */
export function makeServerEntryTunnelPlugin(
  tunnelRoute: TunnelRouteOptions | undefined,
  getBasePath: () => string,
): Plugin {
  const normalizedTunnelOptions = tunnelRoute ? normalizeTunnelRouteOptions(tunnelRoute) : undefined;
  const tunnelOptions = normalizedTunnelOptions ? JSON.stringify(normalizedTunnelOptions) : 'undefined';
  const serverEntryIds = new Set<string>();
  let root = '';

  return {
    name: 'sentry-tanstackstart-server-entry-tunnel',
    enforce: 'pre',
    configResolved(config) {
      root = normalizePath(config.root ?? '');
      const aliases = Array.isArray(config.resolve.alias) ? config.resolve.alias : [];
      const serverEntry = aliases.find(alias => alias.find === SERVER_ENTRY_ALIAS);
      if (serverEntry) {
        serverEntryIds.add(normalizePath(serverEntry.replacement));
      }
    },
    // `vite dev` takes each request in this process and passes it on to where the server entry runs, so its
    // `http.server` span comes from the SDK `--import` set up here, which the server entry never reaches.
    configureServer() {
      setManagedTunnelDefaults({
        tunnel: normalizedTunnelOptions,
        forward: forwardTunnelRequest,
        basePath: getBasePath(),
      });
    },
    async load(id) {
      const normalizedId = normalizePath(id);
      if (!serverEntryIds.has(normalizedId) && !DEFAULT_SERVER_ENTRY.test(normalizedId)) {
        return null;
      }

      const original = JSON.stringify(`${id}${ORIGINAL_SERVER_ENTRY_QUERY}`);
      // The default entry lives in `@tanstack/react-start`, which doesn't depend on this SDK, so resolving the import
      // from there only works when the SDK is hoisted (not under Yarn PnP or pnpm without hoisting). The app depends
      // on it, so a bundled SDK is resolved from the app. An external one keeps its name, which the output resolves.
      const resolved = await this.resolve(SDK_PACKAGE, `${root}/package.json`, { skipSelf: true });
      const sdk = resolved && !resolved.external ? resolved.id : SDK_PACKAGE;

      return `import entry from ${original};
import { _INTERNAL_wrapServerEntryWithSentryTunnel as wrapServerEntryWithSentryTunnel } from ${JSON.stringify(sdk)};
export * from ${original};
export default wrapServerEntryWithSentryTunnel(entry, ${tunnelOptions}, ${JSON.stringify(getBasePath())});
`;
    },
  };
}

function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}
