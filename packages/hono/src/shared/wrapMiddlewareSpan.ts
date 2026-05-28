import {
  getActiveSpan,
  getOriginalFunction,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  type WrappedFunction,
} from '@sentry/core';
import { type MiddlewareHandler } from 'hono';
import { defaultShouldHandleError } from './defaultShouldHandleError';

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

  return new Proxy(handler, {
    async apply(_target, _thisArg, args: Parameters<MiddlewareHandler>) {
      const [context, next] = args;
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
        return await handler(context, next);
      } catch (error) {
        // Error capture is handled by `responseHandler` via `context.error`, so this
        // wrapper only sets span status and rethrows (no `captureException`).
        if (defaultShouldHandleError(error)) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        }
        throw error;
      } finally {
        span.end();
      }
    },
    get(target, prop, receiver) {
      if (prop === '__sentry_original__') {
        return handler;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
