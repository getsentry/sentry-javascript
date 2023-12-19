import { addTracingExtensions, captureException, getCurrentScope, startTransaction } from '@sentry/core';
import type { Span } from '@sentry/types';
import {
  addExceptionMechanism,
  logger,
  objectify,
  tracingContextFromHeaders,
  winterCGRequestToRequestData,
} from '@sentry/utils';

import type { EdgeRouteHandler } from '../../edge/types';
import { DEBUG_BUILD } from '../debug-build';
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

    const req = args[0];
    const currentScope = getCurrentScope();
    const prevSpan = currentScope.getSpan();

    let span: Span | undefined;

    if (prevSpan) {
      span = prevSpan.startChild({
        description: options.spanDescription,
        op: options.spanOp,
        origin: 'auto.function.nextjs',
      });
    } else if (req instanceof Request) {
      const sentryTrace = req.headers.get('sentry-trace') || '';
      const baggage = req.headers.get('baggage');
      const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
        sentryTrace,
        baggage,
      );
      currentScope.setPropagationContext(propagationContext);
      if (traceparentData) {
        DEBUG_BUILD && logger.log(`[Tracing] Continuing trace ${traceparentData.traceId}.`);
      }

      span = startTransaction({
        name: options.spanDescription,
        op: options.spanOp,
        origin: 'auto.ui.nextjs.withEdgeWrapping',
        ...traceparentData,
        metadata: {
          request: winterCGRequestToRequestData(req),
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          source: 'route',
        },
      });
    }

    currentScope?.setSpan(span);

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
      await flushQueue();
    }
  };
}
