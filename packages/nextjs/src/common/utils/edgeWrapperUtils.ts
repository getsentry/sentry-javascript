import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_OK,
  captureException,
  continueTrace,
  getActiveSpan,
  getRootSpan,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import { winterCGRequestToRequestData } from '@sentry/utils';

import type { EdgeRouteHandler } from '../../edge/types';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';
import { flushSafelyWithTimeout } from './responseEnd';
import { commonObjectToIsolationScope, escapeNextjsTracing } from './tracingUtils';
import { vercelWaitUntil } from './vercelWaitUntil';

/**
 * Wraps a function on the edge runtime with error and performance monitoring.
 */
export function withEdgeWrapping<H extends EdgeRouteHandler>(
  handler: H,
  options: { spanDescription: string; spanOp: string; mechanismFunctionName: string },
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args) {
    // Since the spans emitted by Next.js are super buggy with completely wrong timestamps
    // (fix pending at the time of writing this: https://github.com/vercel/next.js/pull/70908) we want to intentionally
    // drop them. In the future, when Next.js' OTEL instrumentation is in a high-quality place we can potentially think
    // about keeping them.
    const nextJsOwnedSpan = getActiveSpan();
    if (nextJsOwnedSpan) {
      getRootSpan(nextJsOwnedSpan)?.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
    }

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

        isolationScope.setTransactionName(options.spanDescription);

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
            );
          },
        ).finally(() => {
          vercelWaitUntil(flushSafelyWithTimeout());
        });
      });
    });
  };
}
