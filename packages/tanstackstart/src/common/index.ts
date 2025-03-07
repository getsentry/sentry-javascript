/**
 * A middleware handler that can be passed to TanStack Start's `createMiddleware().server(...)` method as [global middleware](https://tanstack.com/start/latest/docs/framework/react/middleware#global-middleware) for instrumenting server functions.
 */
export function sentryGlobalServerMiddlewareHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <T>(server: { next: (...args: any[]) => T }): T {
    return server.next();
  };
}

/**
 * Wraps a TanStack Start stream handler with Sentry instrumentation that can be passed to `createStartHandler(...)`.
 */
export function wrapStreamHandlerWithSentry<H>(handler: H): H {
  return handler;
}

/**
 * Wraps the create root route function with Sentry for server-client tracing with SSR.
 */
export function wrapCreateRootRouteWithSentry<F>(createRootRoute: F): F {
  return createRootRoute;
}
