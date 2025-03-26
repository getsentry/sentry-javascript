import type { AppLoadContext, EntryContext } from 'react-router';
import { SENTRY_PARAMETERIZED_ROUTE } from './attributes';
import { getRootSpan, getActiveSpan } from '@sentry/core';

type OriginalHandleRequest = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) => Promise<unknown>;

/**
 * Wraps the original handleRequest function to add Sentry instrumentation.
 *
 * @param originalHandle - The original handleRequest function to wrap
 * @returns A wrapped version of the handle request function with Sentry instrumentation
 */
export function sentryHandleRequest(originalHandle: OriginalHandleRequest): OriginalHandleRequest {
  return async function sentryInstrumentedHandleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext,
  ) {
    const parameterizedPath =
      routerContext?.staticHandlerContext?.matches?.[routerContext.staticHandlerContext.matches.length - 1]?.route.path;
    if (parameterizedPath) {
      const activeSpan = getActiveSpan();
      if (activeSpan) {
        const rootSpan = getRootSpan(activeSpan);
        rootSpan.setAttribute(SENTRY_PARAMETERIZED_ROUTE, parameterizedPath);
      }
    }
    return originalHandle(request, responseStatusCode, responseHeaders, routerContext, loadContext);
  };
}
