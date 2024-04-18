import { withEdgeWrapping } from '../common/utils/edgeWrapperUtils';
import type { EdgeRouteHandler } from './types';

/**
 * Wraps a Next.js edge route handler with Sentry error and performance instrumentation.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(handler, {
    apply: (wrappingTarget, thisArg, args: Parameters<H>) => {
      const req = args[0];

      const wrappedHandler = withEdgeWrapping(wrappingTarget, {
        spanDescription: !(req instanceof Request)
          ? `handler (${parameterizedRoute})`
          : `${req.method} ${parameterizedRoute}`,
        spanOp: 'http.server',
        mechanismFunctionName: 'wrapApiHandlerWithSentry',
      });

      return wrappedHandler.apply(thisArg, args);
    },
  });
}
