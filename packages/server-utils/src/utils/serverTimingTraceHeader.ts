import type { Client } from '@sentry/core';
import { debug, getTraceServerTimingHeader, isSharedCacheable } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

const SERVER_TIMING_HEADER = 'server-timing';

const enabledClients = new WeakSet<Client>();

/**
 * Sends the trace of the request in a `Server-Timing` header of the document responses that
 * `wrapServerRequestHandler` returns, so the browser SDK continues it in the pageload span. The
 * counterpart of `addServerTimingTraceHeader` of `@sentry/node` for runtimes with web `Request`
 * handlers. Framework SDKs turn it on; it is off by default.
 */
export function addServerTimingTraceHeader(client: Client): void {
  enabledClients.add(client);
}

/**
 * Adds the trace of the current context to the `Server-Timing` header of a document response that
 * no shared cache may store, as `@sentry/node` does. A cache would replay the trace, and the sampling
 * decision, of one visitor to everyone who gets the cached copy. An existing `sentry-trace` entry of
 * the app is left alone.
 *
 * A `fetch` response has immutable headers, so it is copied then.
 */
export function withServerTimingTraceHeader<R extends Response | undefined>(client: Client, response: R): R {
  if (!response || !enabledClients.has(client)) {
    return response;
  }

  try {
    const headers = response.headers;
    const getHeader = (name: string): string | undefined => headers.get(name) ?? undefined;
    if (!getHeader('content-type')?.toLowerCase().startsWith('text/html') || isSharedCacheable(getHeader)) {
      return response;
    }

    const existingValue = getHeader(SERVER_TIMING_HEADER);
    if (existingValue?.includes('sentry-trace')) {
      return response;
    }

    const traceHeader = getTraceServerTimingHeader();
    if (!traceHeader) {
      return response;
    }

    const value = existingValue ? `${existingValue}, ${traceHeader}` : traceHeader;
    try {
      headers.set(SERVER_TIMING_HEADER, value);
      return response;
    } catch {
      // Passing the original response as the init keeps its status, status text and headers.
      const copy = new Response(response.body, response);
      copy.headers.set(SERVER_TIMING_HEADER, value);
      return copy as R;
    }
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to add the trace to the Server-Timing header', e);
    return response;
  }
}
