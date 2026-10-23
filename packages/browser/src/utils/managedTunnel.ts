import type { BrowserTunnelOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import {
  debug,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getTunnelPath,
  makeDsn,
  _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { BrowserOptions } from '../client';
import type { BrowserTransportOptions } from '../transports/types';

/**
 * Resolves `tunnel: true`, a relative path or {@link BrowserTunnelOptions} to the managed tunnel's same-origin path.
 */
export function resolveBrowserTunnelOption(
  options: BrowserOptions,
): Pick<BrowserOptions, 'transportOptions' | '_managedTunnel'> & { tunnel: string | undefined } {
  const { tunnel, dsn, transportOptions } = options;
  if (!tunnel || (typeof tunnel === 'string' && !tunnel.startsWith('/'))) {
    return { tunnel, transportOptions };
  }

  const tunnelOptions: BrowserTunnelOptions =
    tunnel === true ? {} : typeof tunnel === 'string' ? { path: tunnel } : tunnel;
  const tunnelPath = tunnelOptions.path ?? (dsn && getTunnelPath(dsn));
  if (!tunnelPath) {
    return { tunnel: undefined, transportOptions };
  }

  const basePath = normalizeTunnelBasePath(tunnelOptions.basePath);
  const resolvedTunnel = `${basePath}${tunnelPath}${tunnelOptions.trailingSlash ? '/' : ''}`;

  DEBUG_BUILD && debug.log(`Tunneling events to "${resolvedTunnel}"`);

  return {
    tunnel: resolvedTunnel,
    _managedTunnel: tunnelOptions,
    // CSRF protection (SvelteKit, Astro) rejects the default `text/plain` POST as a form submission.
    transportOptions: {
      ...transportOptions,
      headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions?.headers },
    },
  };
}

let hasWarnedAboutRejectedDsn = false;

/**
 * Falls back to sending directly when nothing on this origin serves the managed tunnel, i.e. it answers 404 or 405.
 */
export function makeManagedTunnelTransport(
  makeTransport: (options: BrowserTransportOptions) => Transport,
  directHeaders: BrowserTransportOptions['headers'],
): (options: BrowserTransportOptions) => Transport {
  return options => {
    const tunnelTransport = makeTransport(options);
    let directTransport: Transport | undefined;

    return {
      async send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
        if (directTransport) {
          return directTransport.send(envelope);
        }

        const response = await tunnelTransport.send(envelope);
        const statusCode = response.statusCode || 0;

        if (response.headers?.['x-sentry-tunnel']) {
          if (DEBUG_BUILD && statusCode === 403 && !hasWarnedAboutRejectedDsn) {
            hasWarnedAboutRejectedDsn = true;
            debug.warn(
              `The managed tunnel at "${options.url}" rejected this DSN, so events sent through it are lost. Add it to the server's \`allowedDsns\`.`,
            );
          }

          return response;
        }

        // Only a 404 or 405 says nothing serves the path. Any other answer may come from a tunnel the app runs itself.
        const { dsn, sdk } = envelope[0];
        const components = (statusCode === 404 || statusCode === 405) && dsn && makeDsn(dsn);
        if (!components) {
          return response;
        }

        DEBUG_BUILD &&
          debug.warn(`Sending to Sentry directly: "${options.url}" answered ${statusCode} instead of the tunnel.`);
        directTransport ??= makeTransport({
          ...options,
          url: getEnvelopeEndpointWithUrlEncodedAuth(components, undefined, sdk),
          headers: directHeaders,
        });

        return directTransport.send(envelope);
      },
      async flush(timeout?: number): Promise<boolean> {
        const results = await Promise.all([tunnelTransport.flush(timeout), directTransport?.flush(timeout) ?? true]);

        return results.every(Boolean);
      },
    };
  };
}
