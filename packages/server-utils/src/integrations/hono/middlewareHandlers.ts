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
  type SpanAttributes,
  spanToJSON,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
} from '@sentry/core';
import { getClientIPAddress } from '@sentry/core/server';
import type { Context } from './honoTypes';
import { type HonoRuntime, readConnInfo } from './connInfo';
import { hasFetchEvent } from './hono-context';
import { defaultShouldHandleError } from './defaultShouldHandleError';
import { getMiddlewareFlags } from './isMiddleware';
import { getMatchedHandlers, onRouteHandlerStart, wrapRouteHandlers } from './matchResult';
import { resolveRouteName } from './resolveRouteName';
import { type SentryHonoMiddlewareOptions } from './types';
import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_ROUTE,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  NETWORK_TRANSPORT,
  NETWORK_TYPE,
} from '@sentry/conventions/attributes';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context, runtime: HonoRuntime): void {
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

  setConnInfoAttributes(context, runtime, isolationScope);
}

function getCurrentIsolationScope(): Scope {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();

  return defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;
}

/**
 * Adds HTTP connection info (client IP, port, transport, address type) from the runtime to the root
 * (server) span and the isolation scope.
 *
 * Keeps attributes that the runtime SDK already set: it reads forwarding headers, while the runtime
 * objects only know the socket peer, which can be a proxy.
 */
function setConnInfoAttributes(context: Context, runtime: HonoRuntime, isolationScope: Scope): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }

  const connInfo = readConnInfo(context, runtime);
  if (!connInfo) {
    return;
  }

  const { address, port, transport, addressType } = connInfo;

  // Only collect client IP if `userInfo` is enabled (this is primarily for setting data with `.setUser`, but in this case we cannot check for `dataCollection.headers` or similar)
  const ipAddress = address && getClient()?.getDataCollectionOptions().userInfo ? address : undefined;

  const rootSpan = getRootSpan(activeSpan);
  const existingAttributes = spanToJSON(rootSpan).attributes ?? {};
  // Pair `client.port` only with the socket address: behind a proxy, the socket port is the proxy's.
  const writesClientAddress = ipAddress !== undefined && existingAttributes[CLIENT_ADDRESS] === undefined;
  rootSpan.setAttributes(
    onlyNewAttributes(
      {
        [CLIENT_PORT]: writesClientAddress ? port : undefined,
        [NETWORK_PEER_PORT]: port,
        [NETWORK_TRANSPORT]: transport,
        [NETWORK_TYPE]: addressType?.toLowerCase(),
        [CLIENT_ADDRESS]: ipAddress,
        [NETWORK_PEER_ADDRESS]: ipAddress,
      },
      existingAttributes,
    ),
  );

  if (ipAddress) {
    // Like `RequestData`, prefer the forwarding header: behind a proxy, the socket address is the proxy's.
    const userIpAddress = getClientIPAddress(winterCGHeadersToDict(context.req.raw.headers)) || ipAddress;
    isolationScope.setUser({ ...isolationScope.getUser(), ip_address: userIpAddress });
  }
}

/** Keeps the defined attributes that are not on the span yet. */
function onlyNewAttributes(attributes: SpanAttributes, existingAttributes: Record<string, unknown>): SpanAttributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key, value]) => value !== undefined && existingAttributes[key] === undefined),
  );
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
