import type { TunnelOptions } from '@sentry/core';
import type { AstroConfig } from 'astro';
import { TUNNEL_OPTIONS_GLOBAL } from '../tunnel';
import type { VitePlugin } from './cloudflare';

const TUNNEL_OPTIONS_MODULE = 'virtual:@sentry/astro/tunnel-options';
const RESOLVED_TUNNEL_OPTIONS_MODULE = `\0${TUNNEL_OPTIONS_MODULE}`;

/** The tunnel options Astro's routing requires, or `undefined` if the defaults work. */
export function getAstroTunnelOptions(config: Pick<AstroConfig, 'base' | 'trailingSlash'>): TunnelOptions | undefined {
  const basePath = config.base?.replace(/\/$/, '');
  const trailingSlash = config.trailingSlash === 'always';

  return basePath || trailingSlash
    ? { ...(basePath && { basePath }), ...(trailingSlash && { trailingSlash }) }
    : undefined;
}

/** Imported first in the injected init scripts, so the options are set before `Sentry.init` runs. */
export const TUNNEL_OPTIONS_IMPORT = `import "${TUNNEL_OPTIONS_MODULE}";\n`;

/** Serves the module that hands the tunnel options to the SDKs. */
export function makeTunnelOptionsVitePlugin(tunnelOptions: TunnelOptions): VitePlugin {
  return {
    name: 'sentry-astro-tunnel-options',
    resolveId: id => (id === TUNNEL_OPTIONS_MODULE ? RESOLVED_TUNNEL_OPTIONS_MODULE : null),
    load: id =>
      id === RESOLVED_TUNNEL_OPTIONS_MODULE
        ? `globalThis[${JSON.stringify(TUNNEL_OPTIONS_GLOBAL)}] = ${JSON.stringify(tunnelOptions)};`
        : null,
  };
}
