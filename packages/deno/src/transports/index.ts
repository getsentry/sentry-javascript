import type { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/core';
import { consoleSandbox, createTransport, debug, suppressTracing } from '@sentry/core';

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeFetchTransport(options: BaseTransportOptions): Transport {
  const url = new URL(options.url);

  Deno.permissions
    .query({ name: 'net', host: url.host })
    .then(({ state }) => {
      if (state !== 'granted') {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(`Sentry SDK requires 'net' permission to send events.
    Run with '--allow-net=${url.host}' to grant the requires permissions.`);
        });
      }
    })
    .catch(() => {
      debug.warn('Failed to read the "net" permission.');
    });

  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    const requestOptions: RequestInit = {
      body: request.body,
      method: 'POST',
      referrerPolicy: 'strict-origin',
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
      return Promise.reject(e);
    }
  }

  return createTransport(options, makeRequest);
}
