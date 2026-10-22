import type { Envelope, Transport, TransportMakeRequestResponse, TunnelOptions } from '@sentry/core';
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
 * Resolves `tunnel: true` or {@link TunnelOptions} to the same-origin path the server derives from the DSN.
 */
export function resolveBrowserTunnelOption(
  options: BrowserOptions,
): Pick<BrowserOptions, 'transportOptions' | '_managedTunnel'> & { tunnel: string | undefined } {
  const { tunnel, dsn, transportOptions } = options;
  if (typeof tunnel === 'string' || !tunnel) {
    return { tunnel, transportOptions };
  }

  const tunnelOptions: TunnelOptions = tunnel === true ? {} : tunnel;
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
 * Falls back to sending directly when nothing on this origin serves the managed tunnel. An envelope is resent only
 * when the response proves it never reached Sentry.
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

        // Not the tunnel: a 4xx never reached Sentry so it's resent, a 2xx may have, so only later envelopes go direct.
        const rejected = statusCode >= 400 && statusCode < 500;
        const { dsn, sdk } = envelope[0];
        const components = (rejected || (statusCode >= 200 && statusCode < 300)) && dsn && makeDsn(dsn);
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

        return rejected ? directTransport.send(envelope) : response;
      },
      async flush(timeout?: number): Promise<boolean> {
        const results = await Promise.all([tunnelTransport.flush(timeout), directTransport?.flush(timeout) ?? true]);

        return results.every(Boolean);
      },
    };
  };
}
