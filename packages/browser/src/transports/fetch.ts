import { createTransport } from '@sentry/core';
import type { Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { rejectedSyncPromise } from '@sentry/utils';

import type { BrowserTransportOptions } from './types';
import type { FetchImpl } from './utils';
import { clearCachedFetchImplementation, getNativeFetchImplementation } from './utils';

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
      // fetch" error and sending a "network_error" client-outcome - in Chrome, the request status shows "(cancelled)".
      // The `keepalive` flag keeps outgoing requests alive, even when switching pages. We want this since we're
      // frequently sending events right before the user is switching pages (eg. whenfinishing navigation transactions).
      // Gotchas:
      // - `keepalive` isn't supported by Firefox
      // - As per spec (https://fetch.spec.whatwg.org/#http-network-or-cache-fetch), a request with `keepalive: true`
      //   and a content length of > 64 kibibytes returns a network error. We will therefore only activate the flag when
      //   we're below that limit.
      keepalive: request.body.length <= 65536,
      ...options.fetchOptions,
    };

    try {
      return nativeFetch(options.url, requestOptions).then(response => ({
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      }));
    } catch (e) {
      clearCachedFetchImplementation();
      return rejectedSyncPromise(e);
    }
  }

  return createTransport(options, makeRequest);
}
