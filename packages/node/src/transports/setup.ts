import { getEnvelopeEndpointWithUrlEncodedAuth, initAPIDetails, NewTransport, NoopTransport } from '@sentry/core';
import { Transport, TransportOptions } from '@sentry/types';
import { makeDsn } from '@sentry/utils';

import { NodeOptions } from '../types';
import { HTTPSTransport, HTTPTransport, makeNodeTransport } from '.';

/**
 * TODO(v7): Add documentation
 * @inheritDoc
 */
// TODO(v7): Adjust when NewTransport is the default
export function setupNodeTransport(options: NodeOptions): { transport: Transport; newTransport?: NewTransport } {
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
