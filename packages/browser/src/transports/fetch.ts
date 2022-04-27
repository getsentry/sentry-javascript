import { createTransport } from '@sentry/core';
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

import { FetchImpl, getNativeFetchImplementation } from './utils';

export interface FetchTransportOptions extends BaseTransportOptions {
  requestOptions?: RequestInit;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeFetchTransport(
  options: FetchTransportOptions,
  nativeFetch: FetchImpl = getNativeFetchImplementation(),
): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      ...options.requestOptions,
    };

    return nativeFetch(options.url, requestOptions).then(response => ({
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    }));
  }

  return createTransport({ bufferSize: options.bufferSize }, makeRequest);
}
