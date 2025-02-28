/**
 * A middleware handler that can be passed to TanStack Start's `createMiddleware().server(...)` method as [global middleware](https://tanstack.com/start/latest/docs/framework/react/middleware#global-middleware) for instrumenting server functions.
 */
export function sentryGlobalServerMiddlewareHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function <T>(server: { next: (...args: any[]) => T }): T {
    return server.next();
  };
}
