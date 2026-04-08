import {
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  updateSpanName,
  winterCGRequestToRequestData,
} from '@sentry/core';
import type { Context } from 'hono';
import { routePath } from 'hono/route';
import { hasFetchEvent } from '../utils/hono-context';

/**
 * Request handler for Hono framework
 */
export function requestHandler(context: Context): void {
  const defaultScope = getDefaultIsolationScope();
  const currentIsolationScope = getIsolationScope();

  const isolationScope = defaultScope === currentIsolationScope ? defaultScope : currentIsolationScope;

  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(hasFetchEvent(context) ? context.event.request : context.req.raw),
  });
}

/**
 * Response handler for Hono framework
 */
export function responseHandler(context: Context): void {
  const activeSpan = getActiveSpan();
  if (activeSpan) {
    activeSpan.updateName(`${context.req.method} ${routePath(context)}`);
    activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, `${context.req.method} ${routePath(context)}`);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }

  getIsolationScope().setTransactionName(`${context.req.method} ${routePath(context)}`);

  if (context.error) {
    getClient()?.captureException(context.error, {
      mechanism: { handled: false, type: 'auto.http.hono.context_error' },
    });
  }
}
