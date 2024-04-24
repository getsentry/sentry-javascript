import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_OK,
  captureException,
  continueTrace,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { winterCGRequestToRequestData } from '@sentry/utils';

import type { EdgeRouteHandler } from '../../edge/types';
import { flushQueue } from './responseEnd';
import { commonObjectToIsolationScope, escapeNextjsTracing } from './tracingUtils';

/**
 * Wraps a function on the edge runtime with error and performance monitoring.
 */
export function withEdgeWrapping<H extends EdgeRouteHandler>(
  handler: H,
  options: { spanDescription: string; spanOp: string; mechanismFunctionName: string },
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args) {
    return escapeNextjsTracing(() => {
      const req: unknown = args[0];
      return withIsolationScope(commonObjectToIsolationScope(req), isolationScope => {
        let sentryTrace;
        let baggage;

        if (req instanceof Request) {
          sentryTrace = req.headers.get('sentry-trace') || '';
          baggage = req.headers.get('baggage');

          isolationScope.setSDKProcessingMetadata({
            request: winterCGRequestToRequestData(req),
          });
        }

        return continueTrace(
          {
            sentryTrace,
            baggage,
          },
          () => {
            return startSpan(
              {
                name: options.spanDescription,
                op: options.spanOp,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.withEdgeWrapping',
                },
              },
              async span => {
                const handlerResult = await handleCallbackErrors(
                  () => handler.apply(this, args),
                  error => {
                    captureException(error, {
                      mechanism: {
                        type: 'instrument',
                        handled: false,
                        data: {
                          function: options.mechanismFunctionName,
                        },
                      },
                    });
                  },
                );

                if (handlerResult instanceof Response) {
                  setHttpStatus(span, handlerResult.status);
                } else {
                  span.setStatus({ code: SPAN_STATUS_OK });
                }

                return handlerResult;
              },
            ).finally(() => flushQueue());
          },
        );
      });
    });
  };
}
