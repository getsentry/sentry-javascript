import type { EdgeRouteHandler } from '../edge/types';
import { withEdgeWrapping } from './utils/edgeWrapperUtils';

/**
 * Wraps Next.js middleware with Sentry error and performance instrumentation.
 *
 * @param middleware The middleware handler.
 * @returns a wrapped middleware handler.
 */
export function wrapMiddlewareWithSentry<H extends EdgeRouteHandler>(
  middleware: H,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(middleware, {
    apply: (wrappingTarget, thisArg, args: Parameters<H>) => {
      return withEdgeWrapping(wrappingTarget, {
        spanDescription: 'middleware',
        spanOp: 'middleware.nextjs',
        mechanismFunctionName: 'withSentryMiddleware',
      }).apply(thisArg, args);
    },
  });
}
