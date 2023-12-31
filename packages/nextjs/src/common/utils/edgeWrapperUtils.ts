import { addTracingExtensions, captureException, continueTrace, trace } from '@sentry/core';
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

    const transactionContext = continueTrace({
      sentryTrace,
      baggage,
    });

    return trace(
      {
        ...transactionContext,
        name: options.spanDescription,
        op: options.spanOp,
        origin: 'auto.function.nextjs.withEdgeWrapping',
        metadata: {
          ...transactionContext.metadata,
          request: req instanceof Request ? winterCGRequestToRequestData(req) : undefined,
          source: 'route',
        },
      },
      async span => {
        const handlerResult = await handler.apply(this, args);

        if (handlerResult instanceof Response) {
          span?.setHttpStatus(handlerResult.status);
        } else {
          span?.setStatus('ok');
        }

        return handlerResult;
      },
      (err, span) => {
        span?.setStatus('internal_error');
        captureException(err, {
          mechanism: {
            type: 'instrument',
            handled: false,
            data: {
              function: options.mechanismFunctionName,
            },
          },
        });
      },
    ).finally(() => flushQueue());
  };
}
