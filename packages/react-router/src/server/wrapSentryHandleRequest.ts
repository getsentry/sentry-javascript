import { SENTRY_SEGMENT_NAME_SOURCE, HTTP_ROUTE } from '@sentry/conventions/attributes';
import {
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  updateSpanName,
} from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { isInstrumentationApiUsed } from './serverGlobals';

/**
 * React Router v7's `AppLoadContext`, declared here because v8 removed the export: middleware is
 * always enabled there, so the load context is always a `RouterContextProvider`. The SDK supports
 * both majors, so the shape is mirrored instead of imported.
 */
export interface AppLoadContext {
  [key: string]: unknown;
}

// Generic over the load context so apps that augment `AppLoadContext` via declaration merging keep
// their own shape instead of being widened to the base index signature.
type OriginalHandleRequestWithoutMiddleware<LoadContext extends AppLoadContext = AppLoadContext> = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: LoadContext,
) => Promise<unknown>;

type OriginalHandleRequestWithMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) => Promise<unknown>;

/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest<LoadContext extends AppLoadContext>(
  originalHandle: OriginalHandleRequestWithoutMiddleware<LoadContext>,
): OriginalHandleRequestWithoutMiddleware<LoadContext>;
/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithMiddleware,
): OriginalHandleRequestWithMiddleware;
/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithoutMiddleware | OriginalHandleRequestWithMiddleware,
): OriginalHandleRequestWithoutMiddleware | OriginalHandleRequestWithMiddleware {
  return async function sentryInstrumentedHandleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext | RouterContextProvider,
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
      // Type guard to call the correct overload based on loadContext type
      if (isRouterContextProvider(loadContext)) {
        // loadContext is RouterContextProvider
        return await (originalHandle as OriginalHandleRequestWithMiddleware)(
          request,
          responseStatusCode,
          responseHeaders,
          routerContext,
          loadContext,
        );
      } else {
        // loadContext is AppLoadContext
        return await (originalHandle as OriginalHandleRequestWithoutMiddleware)(
          request,
          responseStatusCode,
          responseHeaders,
          routerContext,
          loadContext,
        );
      }
    } finally {
      await flushIfServerless();
    }

    /**
     * Helper type guard to determine if the context is a RouterContextProvider.
     *
     * @param ctx - The context to check
     * @returns True if the context is a RouterContextProvider
     */
    function isRouterContextProvider(ctx: AppLoadContext | RouterContextProvider): ctx is RouterContextProvider {
      return typeof (ctx as RouterContextProvider)?.get === 'function';
    }
  };
}
