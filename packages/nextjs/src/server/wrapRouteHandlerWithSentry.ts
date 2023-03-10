import * as domain from 'domain';

import type { RouteHandlerContext } from '../common/types';
import { wrapRouteHandlerWithSentry as edgeWrapRouteHandlerWithSentry } from '../edge/wrapRouteHandlerWithSentry';

type RouteHandlerArgs = [Request | undefined, { params?: Record<string, string> } | undefined];

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
// This glorious function is essentially just a wrapper around the edge version with domain isolation.
export function wrapRouteHandlerWithSentry<F extends (...args: RouteHandlerArgs) => unknown>(
  routeHandler: F,
  context: RouteHandlerContext,
): F {
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args: Parameters<F>) => {
      return domain.create().bind(() => {
        return edgeWrapRouteHandlerWithSentry(originalFunction, context).apply(thisArg, args);
      })();
    },
  });
}
