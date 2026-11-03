import type { BrowserTunnelOptions } from '@sentry/core';
import type { AstroConfig } from 'astro';
import { TUNNEL_OPTIONS_GLOBAL } from '../tunnel';
import { WORKER_ENTRY_IDS, type VitePlugin } from './cloudflare';

const TUNNEL_OPTIONS_MODULE = 'virtual:@sentry/astro/tunnel-options';
const RESOLVED_TUNNEL_OPTIONS_MODULE = `\0${TUNNEL_OPTIONS_MODULE}`;

/** The tunnel options Astro's routing requires, or `undefined` if the defaults work. */
export function getAstroTunnelOptions(
  config: Pick<AstroConfig, 'base' | 'trailingSlash'>,
): BrowserTunnelOptions | undefined {
  const basePath = config.base?.replace(/\/$/, '');
  const trailingSlash = config.trailingSlash === 'always';

  return basePath || trailingSlash
    ? { ...(basePath && { basePath }), ...(trailingSlash && { trailingSlash }) }
    : undefined;
}

/** Imported first in the injected init scripts, so the options are set before `Sentry.init` runs. */
export const TUNNEL_OPTIONS_IMPORT = `import "${TUNNEL_OPTIONS_MODULE}";\n`;

/**
 * Serves the module that hands the tunnel options to the SDKs. On the server it goes through core's managed tunnel
 * defaults, because the server client isn't always `@sentry/astro`'s: on Cloudflare Workers it's `@sentry/cloudflare`'s,
 * created per request. The Worker entry imports the module first, so the defaults are set before any client exists.
 */
export function makeTunnelOptionsVitePlugin(tunnelOptions: BrowserTunnelOptions): VitePlugin {
  return {
    name: 'sentry-astro-tunnel-options',
    resolveId: id => (id === TUNNEL_OPTIONS_MODULE ? RESOLVED_TUNNEL_OPTIONS_MODULE : null),
    load: (id, options) => {
      if (id !== RESOLVED_TUNNEL_OPTIONS_MODULE) {
        return null;
      }

      return options?.ssr
        ? `import { _INTERNAL_setManagedTunnelDefaults } from '@sentry/astro/middleware';\n_INTERNAL_setManagedTunnelDefaults(${JSON.stringify({ basePath: tunnelOptions.basePath })});`
        : `globalThis[${JSON.stringify(TUNNEL_OPTIONS_GLOBAL)}] = ${JSON.stringify(tunnelOptions)};`;
    },
    transform: (code, id) =>
      WORKER_ENTRY_IDS.some(entryId => id.includes(entryId)) ? TUNNEL_OPTIONS_IMPORT + code : null,
  };
}
