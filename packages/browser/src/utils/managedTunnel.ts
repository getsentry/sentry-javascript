import type { BrowserTunnelOptions } from '@sentry/core';
import {
  debug,
  getTunnelPath,
  makeDsn,
  _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { BrowserOptions } from '../client';

/**
 * Resolves `tunnel: true` or {@link BrowserTunnelOptions} to the managed tunnel's same-origin path. A string is left as
 * written, so a tunnel the app serves itself gets the same requests as before.
 */
export function resolveBrowserTunnelOption(
  options: BrowserOptions,
): Pick<BrowserOptions, 'transportOptions'> & { tunnel: string | undefined } {
  const { tunnel, dsn, transportOptions } = options;
  if (!tunnel || typeof tunnel === 'string') {
    return { tunnel, transportOptions };
  }

  const tunnelOptions: BrowserTunnelOptions = tunnel === true ? {} : tunnel;
  const dsnComponents = dsn && makeDsn(dsn);
  const tunnelPath = tunnelOptions.path ?? (dsnComponents && getTunnelPath(dsnComponents));
  if (!tunnelPath) {
    return { tunnel: undefined, transportOptions };
  }

  const basePath = normalizeTunnelBasePath(tunnelOptions.basePath);
  const resolvedTunnel = `${basePath}${tunnelPath}${tunnelOptions.trailingSlash ? '/' : ''}`;

  DEBUG_BUILD && debug.log(`Tunneling events to "${resolvedTunnel}"`);

  return {
    tunnel: resolvedTunnel,
    transportOptions: {
      ...transportOptions,
      // CSRF protection (SvelteKit, Astro) rejects the default `text/plain` POST to the tunnel as a form submission.
      headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions?.headers },
    },
  };
}
