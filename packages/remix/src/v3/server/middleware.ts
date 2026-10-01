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
    applyRoute(isolationScope, matcher, context);

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

    return response;
  };
}

function applyRoute(isolationScope: Scope, matcher: MatcherLike, context: RequestContextLike): void {
  const route = resolveRoutePattern(matcher, context);
  if (!route) {
    // Nothing matched, so the router falls through to its 404 handler. Leaving the name alone keeps the
    // raw URL out of it, which span streaming requires.
    return;
  }

  const name = `${context.method} ${route}`;
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

function setResponseStatus(response: Response): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan || typeof response?.status !== 'number') {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  rootSpan.setAttribute(HTTP_RESPONSE_STATUS_CODE, response.status);
  rootSpan.setStatus(getSpanStatusFromHttpCode(response.status));
}
