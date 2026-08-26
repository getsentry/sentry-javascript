import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import {
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  updateSpanName,
} from '@sentry/core';
import type { EntryContext } from 'react-router';
import { isInstrumentationApiUsed } from './serverGlobals';

// The load context is `AppLoadContext` on react-router v7 and `RouterContextProvider` on v8, and apps
// can extend `AppLoadContext` with declaration merging. Inference keeps the wrapper compatible with
// all of these shapes.
type OriginalHandleRequest<LoadContext> = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: LoadContext,
) => Promise<unknown>;

/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest<LoadContext>(
  originalHandle: OriginalHandleRequest<LoadContext>,
): OriginalHandleRequest<LoadContext> {
  return async function sentryInstrumentedHandleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: LoadContext,
  ) {
    const parameterizedPath =
      routerContext?.staticHandlerContext?.matches?.[routerContext.staticHandlerContext.matches.length - 1]?.route.path;

    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

    if (parameterizedPath && rootSpan) {
      // Normalize route name - avoid "//" for root routes
      const routeName = parameterizedPath.startsWith('/') ? parameterizedPath : `/${parameterizedPath}`;

      const transactionName = `${request.method} ${routeName}`;

      updateSpanName(rootSpan, transactionName);
      getCurrentScope().setTransactionName(transactionName);

      // Set route attributes - acts as fallback for lazy-only routes when using instrumentation API
      // Don't override origin when instrumentation API is used (preserve instrumentation_api origin)
      if (isInstrumentationApiUsed()) {
        rootSpan.setAttributes({
          [HTTP_ROUTE]: routeName,
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        });
      } else {
        rootSpan.setAttributes({
          [HTTP_ROUTE]: routeName,
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.request_handler',
        });
      }
    }

    try {
      return await originalHandle(request, responseStatusCode, responseHeaders, routerContext, loadContext);
    } finally {
      await flushIfServerless();
    }
  };
}
