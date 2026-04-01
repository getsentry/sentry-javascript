import type { Fetcher } from '@cloudflare/workers-types';
import { getTracingHeadersForFetchRequest } from '@sentry/core';

/**
 * Wraps a fetch-like function to create a span and propagate trace headers
 * (`sentry-trace` and `baggage`) on the outgoing request.
 *
 * Useful for instrumenting Cloudflare bindings that expose a `fetch` method
 * (e.g. Durable Object stubs, Service bindings).
 */
export function instrumentFetcher(fetchFn: Fetcher['fetch']): Fetcher['fetch'] {
  return function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = getTracingHeadersForFetchRequest(input, { headers: init?.headers });

    if (input instanceof Request && init === undefined) {
      if (!headers) {
        return fetchFn(input);
      }

      // Newly created headers already include the previous headers from the original request
      // so we can clone the request and pass in all headers.
      const requestWithTracing = new Request(input, { headers: headers as HeadersInit });

      return fetchFn(requestWithTracing);
    }

    const mergedInit = {
      ...init,
      ...(headers ? { headers } : {}),
    } as NonNullable<Parameters<Fetcher['fetch']>[1]>;

    return fetchFn(input, mergedInit);
  };
}
