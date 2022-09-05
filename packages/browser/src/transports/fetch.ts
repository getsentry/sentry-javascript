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
      // Outgoing requests are usually cancelled when navigating to a different page, causing a "TypeError: Failed to
      // fetch" error and sending a "network_error" client-outcome. In chrome the request status shows "(cancelled)".
      // The `keepalive` flag keeps outgoing requests alive, even when switching pages. We want this since we're
      // frequently sending events (i.e.navigation transactions) right before the user is switching pages.
      keepalive: true,
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
