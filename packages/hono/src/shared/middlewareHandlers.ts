import {
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  updateSpanName,
  type Scope,
  winterCGRequestToRequestData,
} from '@sentry/core';
import type { Context } from 'hono';
import { hasFetchEvent } from '../utils/hono-context';
import { defaultShouldHandleError } from './defaultShouldHandleError';
import { resolveRouteName } from './resolveRouteName';
import { type SentryHonoMiddlewareOptions } from '../shared/types';
import { type GetConnInfo } from 'hono/conninfo';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context, getConnInfo?: GetConnInfo): void {
  const isolationScope = getCurrentIsolationScope();

  // Set a provisional route name as early as possible so events captured during the request
  // (and the transaction itself, should processing be interrupted) already carry the route.
  // It is re-resolved authoritatively in `responseHandler` once the middleware chain has run.
  updateSpanRouteName(isolationScope, context);

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
  // Overwrite the route name now that the middleware chain has run: `routeIndex` is accurate here
  updateSpanRouteName(getCurrentIsolationScope(), context);

  if (context.error) {
    if ((shouldHandleError ?? defaultShouldHandleError)(context.error)) {
      getClient()?.captureException(context.error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    }
  }
}

function updateSpanRouteName(isolationScope: Scope, context: Context): void {
  const routeName = `${context.req.method} ${resolveRouteName(context)}`;
  const activeSpan = getActiveSpan();

  if (activeSpan) {
    activeSpan.updateName(routeName);
    activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, routeName);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }

  isolationScope.setTransactionName(routeName);
}
