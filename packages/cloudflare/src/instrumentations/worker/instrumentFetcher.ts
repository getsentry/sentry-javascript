import type { Fetcher } from '@cloudflare/workers-types';
import { _INTERNAL_getTracingHeadersForFetchRequest } from '@sentry/core';

/**
 * Wraps a fetch-like function to create a span and propagate trace headers
 * (`sentry-trace` and `baggage`) on the outgoing request.
 *
 * Useful for instrumenting Cloudflare bindings that expose a `fetch` method
 * (e.g. Durable Object stubs, Service bindings).
 */
export function instrumentFetcher(fetchFn: Fetcher['fetch']): Fetcher['fetch'] {
  return function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = _INTERNAL_getTracingHeadersForFetchRequest(input, { headers: init?.headers });

    if (input instanceof Request && init === undefined) {
      if (!headers) {
        return fetchFn(input);
      }

      // Newly created headers already include the previous headers from the original request
      // so we can clone the request and pass in all headers.
      const requestWithTracing = new Request(input, { headers: headers as HeadersInit });

      return fetchFn(requestWithTracing);
    }

    if (init instanceof Request) {
      // `init` is itself a Request (the `stub.fetch(url, request)` Workers idiom). A Request's
      // `method`, `headers`, `body` and the rest are prototype getters, not own properties, so the
      // object spread below would drop them and the call would reach the fetcher as a bare GET with
      // no headers or body. Rebuild through the Request constructor, which reads those members by
      // property access, then layer the tracing headers (which already include the request's own
      // headers) on top.
      const request = new Request(input, init);

      if (!headers) {
        return fetchFn(request);
      }

      return fetchFn(new Request(request, { headers: headers as HeadersInit }));
    }

    const mergedInit = {
      ...init,
      ...(headers ? { headers } : {}),
    } as NonNullable<Parameters<Fetcher['fetch']>[1]>;

    return fetchFn(input, mergedInit);
  };
}
