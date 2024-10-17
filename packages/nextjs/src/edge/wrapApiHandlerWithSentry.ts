import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  setCapturedScopesOnSpan,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { vercelWaitUntil, winterCGRequestToRequestData } from '@sentry/utils';
import { flushSafelyWithTimeout } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from './types';

/**
 * Wraps a Next.js edge route handler with Sentry error and performance instrumentation.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(handler, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      // TODO: We still should add central isolation scope creation for when our build-time instrumentation does not work anymore with turbopack.

      return withIsolationScope(isolationScope => {
        const req: unknown = args[0];
        const currentScope = getCurrentScope();

        if (req instanceof Request) {
          isolationScope.setSDKProcessingMetadata({
            request: winterCGRequestToRequestData(req),
          });
          currentScope.setTransactionName(`${req.method} ${parameterizedRoute}`);
        } else {
          currentScope.setTransactionName(`handler (${parameterizedRoute})`);
        }

        let spanName: string;
        let op: string | undefined = 'http.server';

        // If there is an active span, it likely means that the automatic Next.js OTEL instrumentation worked and we can
        // rely on that for parameterization.
        const activeSpan = getActiveSpan();
        if (activeSpan) {
          spanName = `handler (${parameterizedRoute})`;
          op = undefined;

          const rootSpan = getRootSpan(activeSpan);
          if (rootSpan) {
            rootSpan.updateName(
              req instanceof Request ? `${req.method} ${parameterizedRoute}` : `handler ${parameterizedRoute}`,
            );
            rootSpan.setAttributes({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            });
            setCapturedScopesOnSpan(rootSpan, currentScope, isolationScope);
          }
        } else if (req instanceof Request) {
          spanName = `${req.method} ${parameterizedRoute}`;
        } else {
          spanName = `handler ${parameterizedRoute}`;
        }

        return startSpan(
          {
            name: spanName,
            op: op,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrapApiHandlerWithSentry',
            },
          },
          () => {
            return handleCallbackErrors(
              () => wrappingTarget.apply(thisArg, args),
              error => {
                captureException(error, {
                  mechanism: {
                    type: 'instrument',
                    handled: false,
                  },
                });
              },
              () => {
                vercelWaitUntil(flushSafelyWithTimeout());
              },
            );
          },
        );
      });
    },
  });
}
