import * as domain from 'domain';

import type { RouteHandlerContext } from '../common/types';
import { wrapRequestHandlerLikeFunctionWithErrorInstrumentation } from '../common/wrapRequestHandlerLikeFunctionWithErrorInstrumentation';
import { wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation } from '../common/wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation';
import { getCurrentHub } from '../edge';

type RouteHandlerArgs = [Request | undefined, { params?: Record<string, string> } | undefined];

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
export function wrapRouteHandlerWithSentry<F extends (...args: RouteHandlerArgs) => unknown>(
  routeHandler: F,
  context: RouteHandlerContext,
): F {
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args: Parameters<F>) => {
      return domain.create().bind(() => {
        const errorWrappedFunction = wrapRequestHandlerLikeFunctionWithErrorInstrumentation(originalFunction, () => ({
          wrappingTargetName: context.method,
        }));

        const req = args[0];
        const routeConfiguration = args[1];

        const sendDefaultPiiOption = getCurrentHub().getClient()?.getOptions().sendDefaultPii;
        let routeParameters: Record<string, string> = {};

        if (sendDefaultPiiOption && routeConfiguration?.params) {
          routeParameters = routeConfiguration?.params;
        }

        const errorAndPerformanceWrappedFunction = wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation(
          errorWrappedFunction,
          {
            wrapperContextExtractor: () => ({
              requestContextObject: req,
              baggageHeader: req?.headers.get('baggage'),
              sentryTraceHeader: req?.headers.get('sentry-trace'),
            }),
            spanInfoCreator: ({ willCreateTransaction }) => {
              if (willCreateTransaction) {
                return {
                  name: `${context.method} ${context.parameterizedRoute}`,
                  op: 'http.server',
                  data: {
                    routeParameters,
                  },
                };
              } else {
                return {
                  name: `${context.method}()`,
                  op: 'function',
                  data: {
                    route: context.parameterizedRoute,
                  },
                };
              }
            },
          },
        );

        const { returnValue } = errorAndPerformanceWrappedFunction.apply(thisArg, args);
        return returnValue;
      })();
    },
  });
}
