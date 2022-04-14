import {
  BaseTransportOptions,
  getEnvelopeEndpointWithUrlEncodedAuth,
  initAPIDetails,
  NewTransport,
  NoopTransport,
} from '@sentry/core';
import { Transport, TransportOptions } from '@sentry/types';
import { supportsFetch } from '@sentry/utils';

import { BrowserOptions } from '../client';
import { FetchTransport } from './fetch';
import { makeNewFetchTransport } from './new-fetch';
import { makeNewXHRTransport } from './new-xhr';
import { XHRTransport } from './xhr';

export interface BrowserTransportOptions extends BaseTransportOptions {
  // options to pass into fetch request
  fetchParams: Record<string, string>;
  headers?: Record<string, string>;
  sendClientReports?: boolean;
}

/**
 * Sets up Browser transports based on the passed `options`. If available, the returned
 * transport will use the fetch API. In case fetch is not supported, an XMLHttpRequest
 * based transport is created.
 *
 * @returns an object currently still containing both, the old `Transport` and
 * `NewTransport` which will eventually replace `Transport`. Once this is replaced,
 * this function will return a ready to use `NewTransport`.
 */
// TODO(v7): Adjust return value when NewTransport is the default
export function setupBrowserTransport(options: BrowserOptions): {
  transport: Transport;
  newTransport?: NewTransport;
} {
  if (!options.dsn) {
    // We return the noop transport here in case there is no Dsn.
    return { transport: new NoopTransport() };
  }

  const transportOptions: TransportOptions = {
    ...options.transportOptions,
    dsn: options.dsn,
    tunnel: options.tunnel,
    sendClientReports: options.sendClientReports,
    _metadata: options._metadata,
  };

  const api = initAPIDetails(transportOptions.dsn, transportOptions._metadata, transportOptions.tunnel);
  const url = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);

  if (options.transport) {
    return { transport: new options.transport(transportOptions) };
  }

  if (supportsFetch()) {
    const requestOptions: RequestInit = { ...transportOptions.fetchParameters };
    const newTransport = makeNewFetchTransport({ requestOptions, url });
    const fetchTransport = new FetchTransport(transportOptions);
    return { transport: fetchTransport, newTransport };
  }

  const newTransport = makeNewXHRTransport({
    url,
    headers: transportOptions.headers,
  });
  const transport = new XHRTransport(transportOptions);
  return { transport, newTransport };
}
