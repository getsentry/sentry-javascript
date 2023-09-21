import { createTransport } from '@sentry/core';
import type { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { rejectedSyncPromise } from '@sentry/utils';

import type { BrowserTransportOptions } from './types';
import type { FetchImpl } from './utils';
import { clearCachedFetchImplementation, getNativeFetchImplementation } from './utils';

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeSpotlightTransport(
  options: BrowserTransportOptions,
  nativeFetch: FetchImpl = getNativeFetchImplementation(),
): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'origin',
      headers: {
        ...options.headers,
        'Content-Type': 'application/x-sentry-envelope',
      },
      ...options.fetchOptions,
    };

    try {
      return nativeFetch('http://localhost:8969/stream', requestOptions).then(response => {
        return {
          statusCode: response.status,
          headers: {
            'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
            'retry-after': response.headers.get('Retry-After'),
          },
        };
      });
    } catch (e) {
      clearCachedFetchImplementation();
      return rejectedSyncPromise(e);
    }
  }

  const transport = createTransport(options, makeRequest);
  transport.providesUrl = true;
  return transport;
}
