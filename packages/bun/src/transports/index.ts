import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { createTransport, suppressTracing } from '@sentry/core';

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeFetchTransport(options: BaseTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      headers: options.headers,
    };

    try {
      return suppressTracing(() => {
        return fetch(options.url, requestOptions).then(response => {
          // Drain response body to prevent Bun from retaining the backing ArrayBuffer.
          // See: https://github.com/oven-sh/bun/issues/10763, https://github.com/oven-sh/bun/issues/27358
          // try/catch: guards against synchronous TypeError if response.text is not a function.
          // .catch(): handles async rejection if body read fails mid-stream (prevents unhandled promise rejection).
          try { void response.text().catch(() => {}); } catch {} // eslint-disable-line no-empty

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
      return Promise.reject(e);
    }
  }

  return createTransport(options, makeRequest);
}
