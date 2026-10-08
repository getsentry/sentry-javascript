import { HTTP_RESPONSE_STATUS_CODE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import {
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  getSpanStatusFromHttpCode,
  getTraceData,
  INTERNAL_setSegmentNameSourceIfSegment,
  type Scope,
  updateSpanName,
  winterCGRequestToRequestData,
} from '@sentry/core';

import { formatRouteTiming } from '../routeTiming';
import type { MatcherLike, MiddlewareLike, NextFunctionLike, RequestContextLike } from '../types';
import { captureRequestError } from './errorFilter';
import { resolveRoutePattern } from './route';

/**
 * The middleware orchestrion prepends to every router.
 *
 * It opens no span. Remix 3 serves over `node:http`, so `httpIntegration` has already opened the
 * `http.server` span and forked an isolation scope by the time this runs. Opening another would double
 * count every request, so this only enriches what exists, as `@sentry/hono` does.
 */
export function sentryRemixMiddleware(matcher: MatcherLike): MiddlewareLike {
  return async function sentryMiddleware(context: RequestContextLike, next: NextFunctionLike): Promise<Response> {
    const isolationScope = getIsolationScope();
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: winterCGRequestToRequestData(context.request) });

    // Applied before `next()` so anything captured while the handler runs already carries the route.
    const route = resolveRoutePattern(matcher, context);
    if (route) {
      applyRoute(isolationScope, route, context.method);
    }

    let response;
    try {
      response = await next();
    } catch (error) {
      // Captured here as well as in `onError`, so the event carries the route this middleware just put
      // on the scope.
      captureRequestError(error, context.request, 'auto.http.remix_v3.middleware');
      throw error;
    }

    setResponseStatus(response);
    addServerTimingHeaders(response, context.request, route);

    return response;
  };
}

// When nothing matched, the router falls through to its 404 handler. Leaving the name alone keeps the
// raw URL out of it, which span streaming requires.
function applyRoute(isolationScope: Scope, route: string, method: string): void {
  const name = `${method} ${route}`;
  isolationScope.setTransactionName(name);

  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  updateSpanName(rootSpan, name);
  INTERNAL_setSegmentNameSourceIfSegment(rootSpan, 'route');
  rootSpan.setAttribute(HTTP_ROUTE, route);
}

/**
 * What the browser SDK needs from the server on a document: the trace to continue, so a page load
 * joins the request's trace, and the route that served it, so spans are named after the pattern.
 * The browser reads both off the navigation timing entry. Only HTML responses carry them, which is
 * what document loads and the runtime's frame fetches ask for.
 */
function addServerTimingHeaders(response: Response, request: Request, route: string | undefined): void {
  if (!request.headers.get('accept')?.includes('text/html')) {
    return;
  }

  const entries: string[] = [];
  // A shared cache would hand this request's trace to every later page load, so a cacheable response
  // carries the route only. The route is the same for every request to it.
  if (!isSharedCacheable(response)) {
    const traceData = getTraceData();
    if (traceData['sentry-trace']) {
      entries.push(`sentry-trace;desc="${traceData['sentry-trace']}"`);
    }
    if (traceData.baggage) {
      entries.push(`baggage;desc="${traceData.baggage}"`);
    }
  }
  if (route) {
    entries.push(formatRouteTiming(route));
  }

  for (const entry of entries) {
    try {
      response.headers.append('Server-Timing', entry);
    } catch {
      // Immutable headers, e.g. a response passed through from `fetch()`.
      return;
    }
  }
}

/** Whether a cache in front of the app may store this response and serve it to other users. */
function isSharedCacheable(response: Response): boolean {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (/\b(?:no-store|private)\b/.test(cacheControl)) {
    return false;
  }
  // `s-maxage` overrides `max-age` for shared caches. A zero lifetime means the cache revalidates
  // every time, so it never serves this response to anyone else.
  const sharedMaxAge = cacheControl.match(/\bs-maxage\s*=\s*(\d+)/)?.[1];
  if (sharedMaxAge !== undefined) {
    return Number(sharedMaxAge) > 0;
  }
  if (/\bpublic\b/.test(cacheControl)) {
    return true;
  }
  // `max-age` takes precedence over `Expires`, a zero one included.
  const maxAge = cacheControl.match(/\bmax-age\s*=\s*(\d+)/)?.[1];
  if (maxAge !== undefined) {
    return Number(maxAge) > 0;
  }
  // Without a lifetime in `Cache-Control`, a cache falls back to `Expires`.
  const expires = response.headers.get('expires');
  return expires !== null && Date.parse(expires) > Date.now();
}

function setResponseStatus(response: Response): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan || typeof response?.status !== 'number') {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  rootSpan.setAttribute(HTTP_RESPONSE_STATUS_CODE, response.status);
  rootSpan.setStatus(getSpanStatusFromHttpCode(response.status));
}
