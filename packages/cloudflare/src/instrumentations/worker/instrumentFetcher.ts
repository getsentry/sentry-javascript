import type { Fetcher } from '@cloudflare/workers-types';
import { addTraceHeaders } from '../../utils/addTraceHeaders';

/**
 * Wraps a fetch-like function to create a span and propagate trace headers
 * (`sentry-trace` and `baggage`) on the outgoing request.
 *
 * Useful for instrumenting Cloudflare bindings that expose a `fetch` method
 * (e.g. Durable Object stubs, Service bindings).
 */
export function instrumentFetcher(fetchFn: Fetcher['fetch']): Fetcher['fetch'] {
  return function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const newInit = addTraceHeaders(input, init);

    return fetchFn(input, newInit);
  };
}
