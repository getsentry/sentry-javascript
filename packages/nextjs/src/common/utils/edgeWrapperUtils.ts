import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_OK,
  addTracingExtensions,
  captureException,
  continueTrace,
  getIsolationScope,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
} from '@sentry/core';
import { winterCGRequestToRequestData } from '@sentry/utils';

import type { EdgeRouteHandler } from '../../edge/types';
import { flushQueue } from './responseEnd';

/**
 * Wraps a function on the edge runtime with error and performance monitoring.
 */
export function withEdgeWrapping<H extends EdgeRouteHandler>(
  handler: H,
  options: { spanDescription: string; spanOp: string; mechanismFunctionName: string },
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args) {
    addTracingExtensions();
    const req: unknown = args[0];

    let sentryTrace;
    let baggage;

    if (req instanceof Request) {
      sentryTrace = req.headers.get('sentry-trace') || '';
      baggage = req.headers.get('baggage');
    }

    return continueTrace(
      {
        sentryTrace,
        baggage,
      },
      () => {
        getIsolationScope().setSDKProcessingMetadata({
          request: req instanceof Request ? winterCGRequestToRequestData(req) : undefined,
        });
        return startSpan(
          {
            name: options.spanDescription,
            op: options.spanOp,
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
  };
}
