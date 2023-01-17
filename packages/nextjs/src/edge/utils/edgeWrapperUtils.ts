import { captureException, getCurrentHub, startTransaction } from '@sentry/core';
import { hasTracingEnabled } from '@sentry/tracing';
import type { Span } from '@sentry/types';
import {
  addExceptionMechanism,
  baggageHeaderToDynamicSamplingContext,
  extractTraceparentData,
  logger,
  objectify,
} from '@sentry/utils';

import type { EdgeRouteHandler } from '../types';
import { flush } from './flush';

/**
 * Wraps a function on the edge runtime with error and performance monitoring.
 */
export function withEdgeWrapping<H extends EdgeRouteHandler>(
  handler: H,
  options: { spanDescription: string; spanOp: string; mechanismFunctionName: string },
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args) {
    const req = args[0];
    const currentScope = getCurrentHub().getScope();
    const prevSpan = currentScope?.getSpan();

    let span: Span | undefined;

    if (hasTracingEnabled()) {
      if (prevSpan) {
        span = prevSpan.startChild({
          description: options.spanDescription,
          op: options.spanOp,
        });
      } else if (req instanceof Request) {
        // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
        let traceparentData;

        const sentryTraceHeader = req.headers.get('sentry-trace');
        if (sentryTraceHeader) {
          traceparentData = extractTraceparentData(sentryTraceHeader);
          __DEBUG_BUILD__ && logger.log(`[Tracing] Continuing trace ${traceparentData?.traceId}.`);
        }

        const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(req.headers.get('baggage'));

        span = startTransaction(
          {
            name: options.spanDescription,
            op: options.spanOp,
            ...traceparentData,
            metadata: {
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
              source: 'route',
            },
          },
          // extra context passed to the `tracesSampler`
          { request: req },
        );
      }

      currentScope?.setSpan(span);
    }

    try {
      const handlerResult: ReturnType<H> = await handler.apply(this, args);

      if ((handlerResult as unknown) instanceof Response) {
        span?.setHttpStatus(handlerResult.status);
      } else {
        span?.setStatus('ok');
      }

      return handlerResult;
    } catch (e) {
      // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
      // store a seen flag on it.
      const objectifiedErr = objectify(e);

      span?.setStatus('internal_error');

      captureException(objectifiedErr, scope => {
        scope.setSpan(span);
        scope.addEventProcessor(event => {
          addExceptionMechanism(event, {
            type: 'instrument',
            handled: false,
            data: {
              function: options.mechanismFunctionName,
            },
          });
          return event;
        });

        return scope;
      });

      throw objectifiedErr;
    } finally {
      span?.finish();
      currentScope?.setSpan(prevSpan);
      await flush(2000);
    }
  };
}
