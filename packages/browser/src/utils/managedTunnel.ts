import type { BrowserTunnelOptions } from '@sentry/core';
import {
  debug,
  getTunnelPath,
  isURLObjectRelative,
  makeDsn,
  _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath,
  parseStringToURLObject,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { BrowserOptions } from '../client';
import { WINDOW } from '../helpers';

/**
 * Resolves `tunnel: true` or {@link BrowserTunnelOptions} to the managed tunnel's same-origin path. A string is left as
 * written, so a tunnel the app serves itself keeps its URL.
 */
export function resolveBrowserTunnelOption(
  options: Pick<BrowserOptions, 'tunnel' | 'dsn' | 'transportOptions'>,
): Pick<BrowserOptions, 'transportOptions'> & { tunnel: string | undefined } {
  const { tunnel, dsn, transportOptions } = options;
  if (!tunnel) {
    return { tunnel, transportOptions };
  }

  if (typeof tunnel === 'string') {
    return {
      tunnel,
      transportOptions: isSameOrigin(tunnel) ? withEnvelopeContentType(transportOptions) : transportOptions,
    };
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

  return { tunnel: resolvedTunnel, transportOptions: withEnvelopeContentType(transportOptions) };
}

/**
 * Sends envelopes as `application/x-sentry-envelope`. CSRF protection (SvelteKit, Astro) rejects the default
 * `text/plain` POST as a form submission, and the Next.js managed tunnel route on Vercel matches on this header.
 * Cross-origin it would trigger a CORS preflight, so only same-origin tunnels get it.
 */
function withEnvelopeContentType(
  transportOptions: BrowserOptions['transportOptions'],
): BrowserOptions['transportOptions'] {
  return {
    ...transportOptions,
    headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions?.headers },
  };
}

/**
 * Whether the tunnel URL is on the page's origin. Unknown counts as cross-origin.
 */
function isSameOrigin(url: string): boolean {
  const urlObject = parseStringToURLObject(url, WINDOW.location?.href);
  if (!urlObject) {
    return false;
  }

  return isURLObjectRelative(urlObject) || urlObject.origin === WINDOW.location?.origin;
}
