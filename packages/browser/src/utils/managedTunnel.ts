import type { Envelope, Transport, TransportMakeRequestResponse, TunnelOptions } from '@sentry/core';
import { debug, getEnvelopeEndpointWithUrlEncodedAuth, getTunnelPath, makeDsn } from '@sentry/core';
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

  const basePath = tunnelOptions.basePath?.replace(/\/$/, '') ?? '';
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

    const switchToDirect = (envelope: Envelope, reason: string): Transport | undefined => {
      const { dsn, sdk } = envelope[0];
      const components = dsn && makeDsn(dsn);
      if (components && !directTransport) {
        DEBUG_BUILD && debug.warn(`Sending to Sentry directly: ${reason}`);
        directTransport = makeTransport({
          ...options,
          url: getEnvelopeEndpointWithUrlEncodedAuth(components, undefined, sdk),
          headers: directHeaders,
        });
      }

      return directTransport;
    };

    return {
      async send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
        if (directTransport) {
          return directTransport.send(envelope);
        }

        const response = await tunnelTransport.send(envelope);
        const { statusCode } = response;

        // Nothing handles the tunnel path, so the envelope never reached Sentry and is safe to send once more.
        if (statusCode === 404 || statusCode === 405) {
          const transport = switchToDirect(envelope, `nothing answers the managed tunnel at "${options.url}".`);

          return transport ? transport.send(envelope) : response;
        }

        // Something other than the tunnel handler answered, like a static host serving `index.html`. This envelope
        // may have been delivered all the same, so it isn't sent again, only the ones after it go directly.
        if (
          statusCode !== undefined &&
          statusCode >= 200 &&
          statusCode < 300 &&
          !response.headers?.['x-sentry-tunnel']
        ) {
          switchToDirect(envelope, `the response from "${options.url}" didn't come from a Sentry tunnel handler.`);
        }

        return response;
      },
      async flush(timeout?: number): Promise<boolean> {
        const results = await Promise.all([tunnelTransport.flush(timeout), directTransport?.flush(timeout) ?? true]);

        return results.every(Boolean);
      },
    };
  };
}
