import {
  captureException,
  getActiveSpan,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
} from '@sentry/core';
import type { Env, Hono, MiddlewareHandler } from 'hono';

const MIDDLEWARE_ORIGIN = 'auto.middleware.hono';

/**
 * Patches `app.use` so that every middleware registered through it is automatically
 * wrapped in a Sentry span. Supports both forms: `app.use(...handlers)` and `app.use(path, ...handlers)`.
 */
export function patchAppUse<E extends Env>(app: Hono<E>): void {
  app.use = new Proxy(app.use, {
    apply(target: typeof app.use, thisArg: typeof app, args: Parameters<typeof app.use>): ReturnType<typeof app.use> {
      const [first, ...rest] = args as [unknown, ...MiddlewareHandler[]];

      if (typeof first === 'string') {
        const wrappedHandlers = rest.map(handler => wrapMiddlewareWithSpan(handler));
        return Reflect.apply(target, thisArg, [first, ...wrappedHandlers]);
      }

      const allHandlers = [first as MiddlewareHandler, ...rest].map(handler => wrapMiddlewareWithSpan(handler));
      return Reflect.apply(target, thisArg, allHandlers);
    },
  });
}

/**
 * Wraps a Hono middleware handler so that its execution is traced as a Sentry span.
 * Explicitly parents each span under the root (transaction) span so that all middleware
 * spans are siblings — even when OTel instrumentation introduces nested active contexts
 * (onion order: A → B → handler → B → A would otherwise nest B under A).
 */
function wrapMiddlewareWithSpan(handler: MiddlewareHandler): MiddlewareHandler {
  return async function sentryTracedMiddleware(context, next) {
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
}
