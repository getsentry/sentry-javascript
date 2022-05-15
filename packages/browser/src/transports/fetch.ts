import { createTransport } from '@sentry/core';
import { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

import { BrowserTransportOptions } from './types';
import { FetchImpl, getNativeFetchImplementation } from './utils';

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeFetchTransport(
  options: BrowserTransportOptions,
  nativeFetch: FetchImpl = getNativeFetchImplementation(),
): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      headers: options.headers,
      ...options.fetchOptions,
    };

    return nativeFetch(options.url, requestOptions).then(response => ({
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    }));
  }

  return createTransport(options, makeRequest);
}
