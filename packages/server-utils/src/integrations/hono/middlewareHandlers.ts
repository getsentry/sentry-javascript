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

  // Set a provisional route name as early as possible so events captured during the request already carry the route.
  // It is re-resolved in `responseHandler` once the middleware chain has run.
  updateSpanRouteName(isolationScope, context);

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
  // Overwrite the route name now that the middleware chain has run: `routeIndex` is accurate here
  updateSpanRouteName(getCurrentIsolationScope(), context);

  captureContextError(context, shouldHandleError);
}

/**
 * Captures an unhandled context error, gated by the user's `shouldHandleError` (or the default).
 *
 * Split out from {@link responseHandler} so a deduplicated middleware can still report its own
 * context's error without re-resolving the route name or overwriting request data — e.g. the inner
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

function updateSpanRouteName(isolationScope: Scope, context: Context): void {
  const route = resolveRouteName(context);
  const routeName = `${context.req.method} ${route}`;
  const activeSpan = getActiveSpan();

  if (activeSpan) {
    activeSpan.updateName(routeName);

    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, routeName);
    INTERNAL_setSegmentNameSourceIfSegment(rootSpan, 'route');
    rootSpan.setAttribute(HTTP_ROUTE, route);
  }

  isolationScope.setTransactionName(routeName);
}
