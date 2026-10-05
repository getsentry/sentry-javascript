import { HTTP_RESPONSE_STATUS_CODE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import {
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  getSpanStatusFromHttpCode,
  INTERNAL_setSegmentNameSourceIfSegment,
  type Scope,
  updateSpanName,
  winterCGRequestToRequestData,
} from '@sentry/core';

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
    if (route) {
      addRouteHeader(response, context.request, route);
    }

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
 * Tells the browser SDK which route served a document, so it can name its page load and navigation
 * spans after the pattern. The browser has no route table of its own. Only HTML responses carry it,
 * which is what document loads and the runtime's frame fetches ask for.
 */
function addRouteHeader(response: Response, request: Request, route: string): void {
  if (!request.headers.get('accept')?.includes('text/html')) {
    return;
  }
  try {
    // Quoted string per the header grammar; the browser unquotes it for the timing entry.
    const quoted = route.replace(/["\\]/g, '\\$&');
    response.headers.append('Server-Timing', `sentry-route;desc="${quoted}"`);
  } catch {
    // Immutable headers, e.g. a response passed through from `fetch()`.
  }
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
