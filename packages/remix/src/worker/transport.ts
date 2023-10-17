import { createTransport } from '@sentry/core';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

export type WorkersTransportOptions = BaseTransportOptions & {
  headers?: Record<string, string>;
  context?: Record<string, any>;
  fetcher?: typeof fetch;
};

/**
 * Creates a Transport that uses the Cloudflare Workers' or Shopify Oxygen's fetch API to send events to Sentry.
 */
export function makeWorkerTransport(options: WorkersTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      headers: options.headers,
    };

    const fetchRequest = fetch(options.url, requestOptions).then(response => {
      return {
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      };
    });

    // If we're in a Cloudflare Worker, wait for the fetch to complete
    // before returning. This ensures that the Worker doesn't shut down
    if (options.context && options.context.waitUntil) {
      options.context.waitUntil(fetchRequest);
    }

    return fetchRequest;
  }

  return createTransport(options, makeRequest);
}
