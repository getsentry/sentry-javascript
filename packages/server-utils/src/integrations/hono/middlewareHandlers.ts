import {
  captureException,
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  INTERNAL_setSegmentNameSourceIfSegment,
  updateSpanName,
  type Scope,
  type Span,
  winterCGRequestToRequestData,
} from '@sentry/core';
import type { Context, GetConnInfo } from './honoTypes';
import { hasFetchEvent } from './hono-context';
import { defaultShouldHandleError } from './defaultShouldHandleError';
import { getMiddlewareFlags } from './isMiddleware';
import { getMatchedHandlers, onRouteHandlerStart, wrapRouteHandlers } from './matchResult';
import { resolveRouteName } from './resolveRouteName';
import { type SentryHonoMiddlewareOptions } from './types';
import { HTTP_ROUTE } from '@sentry/conventions/attributes';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context, getConnInfo?: GetConnInfo): void {
  const isolationScope = getCurrentIsolationScope();
  // Read now: when a route handler starts, a user span can be active.
  const span = getActiveSpan();

  // Hono 5 removes `c.req.matchedRoutes`. Before Hono 4.8, it is the only source.
  const matchedHandlers = getMatchedHandlers(context);
  const routes = matchedHandlers?.map(([[, route]]) => route) ?? context.req.matchedRoutes ?? [];
  const middlewareFlags = getMiddlewareFlags(routes);
  const nameSpan = (): void =>
    updateSpanRouteName(isolationScope, span, context, resolveRouteName(context, routes, middlewareFlags));

  // Name early, so that events from the handlers carry the route.
  nameSpan();

  // A route handler that calls `next()` passes the request on, so rename when each one starts. Without
  // the getter, only the Context hook can wrap the route handlers.
  if (!matchedHandlers || wrapRouteHandlers(matchedHandlers, middlewareFlags)) {
    onRouteHandlerStart(context, nameSpan);
  }

  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(hasFetchEvent(context) ? context.event.request : context.req.raw),
  });

  if (getConnInfo) {
    setConnInfoAttributes(context, getConnInfo, isolationScope);
  }
}

function getCurrentIsolationScope(): Scope {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();

  return defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;
}

/**
 * Adds HTTP connection info (client IP, port, transport, address type) from Hono's `getConnInfo`
 * helper to the root (server) span and the isolation scope.
 */
function setConnInfoAttributes(context: Context, getConnInfo: GetConnInfo, isolationScope: Scope): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }

  let remote: ReturnType<GetConnInfo>['remote'] | undefined;
  try {
    remote = getConnInfo(context).remote;
  } catch {
    // The helper can throw when the underlying socket/env is unavailable (e.g. unsupported runtime).
    return;
  }

  const { address, port, transport, addressType } = remote || {};

  // Only collect client IP if `userInfo` is enabled (this is primarily for setting data with `.setUser`, but in this case we cannot check for `dataCollection.headers` or similar)
  const ipAddress = address && getClient()?.getDataCollectionOptions().userInfo ? address : undefined;

  getRootSpan(activeSpan).setAttributes({
    'client.port': port,
    'network.peer.port': port,
    'network.transport': transport,
    'network.type': addressType?.toLowerCase(),
    'client.address': ipAddress,
    'network.peer.address': ipAddress,
  });

  if (ipAddress) {
    isolationScope.setUser({ ...isolationScope.getUser(), ip_address: ipAddress });
  }
}

/**
 * Response handler for Hono framework
 */
export function responseHandler(
  context: Context,
  shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError'],
): void {
  captureContextError(context, shouldHandleError);
}

/**
 * Captures an unhandled context error, gated by the user's `shouldHandleError` (or the default).
 *
 * A deduplicated middleware calls it directly to report the error of its own context — e.g. the inner
 * context of an internal `.request()` whose route threw but whose failed response the outer handler
 * swallowed.
 */
export function captureContextError(
  context: Context,
  shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError'],
): void {
  if (context.error) {
    if ((shouldHandleError ?? defaultShouldHandleError)(context.error)) {
      captureException(context.error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    }
  }
}

function updateSpanRouteName(
  isolationScope: Scope,
  activeSpan: Span | undefined,
  context: Context,
  route: string | undefined,
): void {
  // Without a route, keep the span name from the runtime.
  if (route === undefined) {
    return;
  }

  const routeName = `${context.req.method} ${route}`;

  if (activeSpan) {
    activeSpan.updateName(routeName);

    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, routeName);
    INTERNAL_setSegmentNameSourceIfSegment(rootSpan, 'route');
    rootSpan.setAttribute(HTTP_ROUTE, route);
  }

  isolationScope.setTransactionName(routeName);
}
