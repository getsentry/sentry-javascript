import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  flushIfServerless,
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type { AppLoadContext, EntryContext, RouterContextProvider } from 'react-router';

type OriginalHandleRequestWithoutMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
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
export function wrapSentryHandleRequest(
  originalHandle: OriginalHandleRequestWithoutMiddleware,
): OriginalHandleRequestWithoutMiddleware;
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
      const routeName = `/${parameterizedPath}`;

      // The express instrumentation writes on the rpcMetadata and that ends up stomping on the `http.route` attribute.
      const rpcMetadata = getRPCMetadata(context.active());

      if (rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = routeName;
      }

      // The span exporter picks up the `http.route` (ATTR_HTTP_ROUTE) attribute to set the transaction name
      rootSpan.setAttributes({
        [ATTR_HTTP_ROUTE]: routeName,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.request-handler',
      });
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

// todo(v11): remove this
/** @deprecated Use `wrapSentryHandleRequest` instead. */
export const sentryHandleRequest = wrapSentryHandleRequest;
