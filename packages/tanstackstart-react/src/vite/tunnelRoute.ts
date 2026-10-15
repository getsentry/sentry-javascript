import type { TunnelOptions } from '@sentry/core';
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
 * Maps `tunnelRoute` onto the options `Sentry.init({ tunnel })` takes, so both are served the same way.
 */
export function normalizeTunnelRouteOptions(options: TunnelRouteOptions): TunnelOptions {
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
  };
}

const SERVER_ENTRY_ALIAS = 'virtual:tanstack-start-server-entry';
const ORIGINAL_SERVER_ENTRY_QUERY = '?sentry-tunnel-original';
// The default entry is used directly when the app has no `src/server.ts`, and by Cloudflare's `main`.
const DEFAULT_SERVER_ENTRY = /\/react-start\/dist\/(?:plugin\/)?default-entry\/(?:esm\/)?server\.[jt]s$/;

/**
 * Wraps the TanStack Start server entry so tunnel requests are answered before Start's own request middleware and
 * routing. It does nothing unless the managed tunnel is enabled, either here via `tunnelRoute` or at runtime via
 * `Sentry.init({ tunnel: true })`.
 */
export function makeServerEntryTunnelPlugin(tunnelRoute: TunnelRouteOptions | undefined): Plugin {
  const tunnelOptions = tunnelRoute ? JSON.stringify(normalizeTunnelRouteOptions(tunnelRoute)) : 'undefined';
  const serverEntryIds = new Set<string>();

  return {
    name: 'sentry-tanstackstart-server-entry-tunnel',
    enforce: 'pre',
    configResolved(config) {
      const aliases = Array.isArray(config.resolve.alias) ? config.resolve.alias : [];
      const serverEntry = aliases.find(alias => alias.find === SERVER_ENTRY_ALIAS);
      if (serverEntry) {
        serverEntryIds.add(normalizePath(serverEntry.replacement));
      }
    },
    load(id) {
      const normalizedId = normalizePath(id);
      if (!serverEntryIds.has(normalizedId) && !DEFAULT_SERVER_ENTRY.test(normalizedId)) {
        return null;
      }

      const original = JSON.stringify(`${id}${ORIGINAL_SERVER_ENTRY_QUERY}`);

      return `import entry from ${original};
import { wrapServerEntryWithSentryTunnel } from '@sentry/tanstackstart-react';
export * from ${original};
export default wrapServerEntryWithSentryTunnel(entry, ${tunnelOptions});
`;
    },
  };
}

function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}
