import { createTransport } from '@sentry/core';
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

export interface EdgeTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. Used by the FetchTransport */
  fetchOptions?: RequestInit;
  /** Custom headers for the transport. Used by the XHRTransport and FetchTransport */
  headers?: { [key: string]: string };
}

/**
 * Creates a Transport that uses the Edge Runtimes native fetch API to send events to Sentry.
 */
export function makeEdgeTransport(options: EdgeTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      headers: options.headers,
      ...options.fetchOptions,
    };

    try {
      return fetch(options.url, requestOptions).then(response => ({
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      }));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  return createTransport(options, makeRequest);
}
