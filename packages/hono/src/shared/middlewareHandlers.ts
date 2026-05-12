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
import { isExpectedError } from './isExpectedError';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context): void {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();

  const isolationScope = defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;

  updateSpanRouteName(isolationScope, context);

  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(hasFetchEvent(context) ? context.event.request : context.req.raw),
  });
}

/**
 * Response handler for Hono framework
 */
export function responseHandler(context: Context): void {
  if (context.error && !isExpectedError(context.error)) {
    getClient()?.captureException(context.error, {
      mechanism: { handled: false, type: 'auto.http.hono.context_error' },
    });
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
