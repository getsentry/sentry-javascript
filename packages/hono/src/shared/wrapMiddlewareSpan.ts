import {
  captureException,
  getActiveSpan,
  getRootSpan,
  getOriginalFunction,
  markFunctionWrapped,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
  type WrappedFunction,
} from '@sentry/core';
import { type MiddlewareHandler } from 'hono';

const MIDDLEWARE_ORIGIN = 'auto.middleware.hono';

/**
 * Wraps a Hono middleware handler so that its execution is traced as a Sentry span.
 * Explicitly parents each span under the root (transaction) span so that all middleware
 * spans are siblings — even when OTel instrumentation introduces nested active contexts
 * (onion order: A → B → handler → B → A would otherwise nest B under A).
 */
export function wrapMiddlewareWithSpan(handler: MiddlewareHandler): MiddlewareHandler {
  if (getOriginalFunction(handler as unknown as WrappedFunction)) {
    return handler;
  }

  const wrapped: MiddlewareHandler = async function sentryTracedMiddleware(context, next) {
    const activeSpan = getActiveSpan();
    const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
    const span = startInactiveSpan({
      name: handler.name || '<anonymous>',
      op: 'middleware.hono',
      onlyIfParent: true,
      parentSpan: rootSpan,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.hono',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MIDDLEWARE_ORIGIN,
      },
    });

    try {
      const result = await handler(context, next);
      span.setStatus({ code: SPAN_STATUS_OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      captureException(error, {
        mechanism: { handled: false, type: MIDDLEWARE_ORIGIN },
      });
      throw error;
    } finally {
      span.end();
    }
  };

  markFunctionWrapped(wrapped as unknown as WrappedFunction, handler as unknown as WrappedFunction);
  return wrapped;
}
