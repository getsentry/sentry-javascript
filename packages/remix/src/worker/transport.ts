import { createTransport } from '@sentry/core';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';

export type CloudflareWorkersTransportOptions = BaseTransportOptions & {
  headers?: Record<string, string>;
  context?: Record<string, any>;
  fetcher?: typeof fetch;
};

/**
 * Creates a Transport that uses the Cloudflare Workers' fetch API to send events to Sentry.
 */
export function makeCloudflareTransport(options: CloudflareWorkersTransportOptions): Transport {
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

    if (options.context && options.context.waitUntil) {
      options.context.waitUntil(fetchRequest);
    }

    return fetchRequest;
  }

  return createTransport(options, makeRequest);
}
