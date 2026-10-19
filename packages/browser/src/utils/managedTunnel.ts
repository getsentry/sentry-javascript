import type { Envelope, Transport, TransportMakeRequestResponse, TunnelOptions } from '@sentry/core';
import {
  debug,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getTunnelPath,
  makeDsn,
  normalizeTunnelBasePath,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { BrowserOptions } from '../client';
import type { BrowserTransportOptions } from '../transports/types';

/**
 * Resolves the `tunnel` option `init` received. `true` or {@link TunnelOptions} point the tunnel at the same-origin
 * path the server SDK derives from the same DSN.
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
    // Lets the client explain a tunnel request that nothing on the server answers.
    _managedTunnel: tunnelOptions,
    // The fetch transport sends `text/plain` by default to avoid a CORS preflight. A same-origin request has no
    // preflight, and frameworks with CSRF protection (SvelteKit, Astro) reject a `text/plain` POST as a form submission.
    transportOptions: {
      ...transportOptions,
      headers: { 'Content-Type': 'application/x-sentry-envelope', ...transportOptions?.headers },
    },
  };
}

let hasWarnedAboutRejectedDsn = false;

/**
 * Sends to Sentry directly once it's clear nothing on this origin serves the managed tunnel, e.g. in a static build,
 * on an SPA host, or when the server SDK isn't set up. An envelope is only sent again when the tunnel's response
 * proves it was never ingested, so nothing reaches Sentry twice.
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

        // The tunnel handler answered, so whatever status it passes on is Sentry's.
        if (response.headers?.['x-sentry-tunnel']) {
          if (DEBUG_BUILD && statusCode === 403 && !hasWarnedAboutRejectedDsn) {
            hasWarnedAboutRejectedDsn = true;
            debug.warn(
              `The managed tunnel at "${options.url}" rejected this DSN, so events sent through it are lost. Add it to the server's \`allowedDsns\`.`,
            );
          }

          return response;
        }

        // Something other than the tunnel handler answered. A 4xx (nothing serves the path, an auth middleware) never
        // reached Sentry, so it is sent once more. A 2xx (a static host serving `index.html`) may have been delivered,
        // so only the envelopes after it go directly.
        const rejected = statusCode >= 400 && statusCode < 500;
        const { dsn, sdk } = envelope[0];
        const components = (rejected || (statusCode >= 200 && statusCode < 300)) && dsn && makeDsn(dsn);
        if (!components) {
          return response;
        }

        DEBUG_BUILD &&
          debug.warn(`Sending to Sentry directly: "${options.url}" answered ${statusCode} instead of the tunnel.`);
        // Envelopes sent at the same time all land here, and they share one direct transport.
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
