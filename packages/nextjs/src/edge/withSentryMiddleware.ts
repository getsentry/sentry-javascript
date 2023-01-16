import type { EdgeRouteHandler } from './types';
import { withEdgeWrapping } from './utils/edgeWrapperUtils';

/**
 * Wraps Next.js middleware with Sentry error and performance instrumentation.
 */
export function withSentryMiddleware<H extends EdgeRouteHandler>(
  middleware: H,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return withEdgeWrapping(middleware, {
    spanDescription: 'middleware',
    spanOp: 'middleware.nextjs',
    mechanismFunctionName: 'withSentryMiddleware',
  });
}
