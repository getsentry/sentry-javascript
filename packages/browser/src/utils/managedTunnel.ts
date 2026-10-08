import type { TunnelOptions } from '@sentry/core';
import { debug, getTunnelPath } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { BrowserOptions } from '../client';

/**
 * Resolves the `tunnel` option `init` received. `true` or {@link TunnelOptions} point the tunnel at the same-origin
 * path the server SDK derives from the same DSN.
 */
export function resolveBrowserTunnelOption(
  options: BrowserOptions,
): Pick<BrowserOptions, 'transportOptions'> & { tunnel: string | undefined } {
  const { tunnel, dsn, transportOptions } = options;
  if (typeof tunnel === 'string' || !tunnel) {
    return { tunnel, transportOptions };
  }

  const tunnelPath = dsn && getTunnelPath(dsn);
  if (!tunnelPath) {
    return { tunnel: undefined, transportOptions };
  }

  const tunnelOptions: TunnelOptions = tunnel === true ? {} : tunnel;
  const basePath = tunnelOptions.basePath?.replace(/\/$/, '') ?? '';
  const resolvedTunnel = `${basePath}${tunnelPath}${tunnelOptions.trailingSlash ? '/' : ''}`;

  DEBUG_BUILD && debug.log(`Tunneling events to "${resolvedTunnel}"`);

  return {
    tunnel: resolvedTunnel,
    // The fetch transport sends `text/plain` by default to avoid a CORS preflight. A same-origin request has no
    // preflight, and frameworks with CSRF protection (SvelteKit, Astro) reject a `text/plain` POST as a form submission.
    transportOptions: {
      ...transportOptions,
      headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions?.headers },
    },
  };
}
