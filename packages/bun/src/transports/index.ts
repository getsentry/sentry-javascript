import { createTransport, suppressTracing } from '@sentry/core';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { rejectedSyncPromise } from '@sentry/utils';

export interface BunTransportOptions extends BaseTransportOptions {
  /** Custom headers for the transport. Used by the XHRTransport and FetchTransport */
  headers?: { [key: string]: string };
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeFetchTransport(options: BunTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      headers: options.headers,
    };

    try {
      return suppressTracing(() => {
        return fetch(options.url, requestOptions).then(response => {
          return {
            statusCode: response.status,
            headers: {
              'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
              'retry-after': response.headers.get('Retry-After'),
            },
          };
        });
      });
    } catch (e) {
      return rejectedSyncPromise(e);
    }
  }

  return createTransport(options, makeRequest);
}
