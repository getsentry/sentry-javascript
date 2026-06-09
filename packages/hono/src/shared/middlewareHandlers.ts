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
import { routePath } from 'hono/route';
import { hasFetchEvent } from '../utils/hono-context';
import { defaultShouldHandleError } from './defaultShouldHandleError';
import { type SentryHonoMiddlewareOptions } from '../shared/types';
import { type GetConnInfo } from 'hono/conninfo';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context, getConnInfo?: GetConnInfo): void {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();

  const isolationScope = defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;

  updateSpanRouteName(isolationScope, context);

  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(hasFetchEvent(context) ? context.event.request : context.req.raw),
  });

  if (getConnInfo) {
    setConnInfoAttributes(context, getConnInfo, isolationScope);
  }
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

  // Only collect client IP if `userInfo` is enabled (this primarily for setting data with `.setUser` but we in this case we cannot check for `dataCollection.headers` or similar)
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
    isolationScope.setUser({ ip_address: ipAddress });
  }
}

/**
 * Response handler for Hono framework
 */
export function responseHandler(
  context: Context,
  shouldHandleError?: SentryHonoMiddlewareOptions['shouldHandleError'],
): void {
  if (context.error) {
    if ((shouldHandleError ?? defaultShouldHandleError)(context.error)) {
      getClient()?.captureException(context.error, {
        mechanism: { handled: false, type: 'auto.http.hono.context_error' },
      });
    }
  }
}

function updateSpanRouteName(isolationScope: Scope, context: Context): void {
  const activeSpan = getActiveSpan();

  // Final matched route: https://hono.dev/docs/helpers/route#using-with-index-parameter
  const lastMatchedRoute = routePath(context, -1);

  if (activeSpan) {
    activeSpan.updateName(`${context.req.method} ${lastMatchedRoute}`);
    activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, `${context.req.method} ${lastMatchedRoute}`);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }

  isolationScope.setTransactionName(`${context.req.method} ${lastMatchedRoute}`);
}
