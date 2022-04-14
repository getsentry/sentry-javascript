import { getEnvelopeEndpointWithUrlEncodedAuth, initAPIDetails, NewTransport, NoopTransport } from '@sentry/core';
import { Transport, TransportOptions } from '@sentry/types';
import { makeDsn } from '@sentry/utils';

import { NodeClientOptions } from '../types';
import { HTTPSTransport, HTTPTransport, makeNodeTransport } from '.';

/**
 * Sets up Node transport based on the passed `options`.
 *
 * @returns an object currently still containing both, the old `Transport` and
 * `NewTransport` which will eventually replace `Transport`. Once this is replaced,
 * this function will return a ready to use `NewTransport`.
 */
// TODO(v7): Adjust return value when NewTransport is the default
export function setupNodeTransport(options: NodeClientOptions): { transport: Transport; newTransport?: NewTransport } {
  if (!options.dsn) {
    // We return the noop transport here in case there is no Dsn.
    return { transport: new NoopTransport() };
  }

  const dsn = makeDsn(options.dsn);

  const transportOptions: TransportOptions = {
    ...options.transportOptions,
    ...(options.httpProxy && { httpProxy: options.httpProxy }),
    ...(options.httpsProxy && { httpsProxy: options.httpsProxy }),
    ...(options.caCerts && { caCerts: options.caCerts }),
    dsn: options.dsn,
    tunnel: options.tunnel,
    _metadata: options._metadata,
  };

  if (options.transport) {
    return { transport: new options.transport(transportOptions) };
  }

  const api = initAPIDetails(transportOptions.dsn, transportOptions._metadata, transportOptions.tunnel);
  const url = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);

  const newTransport = makeNodeTransport({
    url,
    headers: transportOptions.headers,
    proxy: transportOptions.httpProxy,
    caCerts: transportOptions.caCerts,
  });

  if (dsn.protocol === 'http') {
    return { transport: new HTTPTransport(transportOptions), newTransport };
  }
  return { transport: new HTTPSTransport(transportOptions), newTransport };
}
