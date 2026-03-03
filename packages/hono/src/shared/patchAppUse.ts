import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
} from '@sentry/core';
import type { Hono, MiddlewareHandler } from 'hono';

const MIDDLEWARE_ORIGIN = 'auto.middleware.hono';

// Module-level counter for anonymous middleware span names
let MIDDLEWARE_IDX = 0;

/**
 * Patches `app.use` so that every middleware registered through it is automatically
 * wrapped in a Sentry span. Supports both forms: `app.use(...handlers)` and `app.use(path, ...handlers)`.
 */
export function patchAppUse(app: Hono): void {
  app.use = new Proxy(app.use, {
    apply(target: typeof app.use, thisArg: typeof app, args: Parameters<typeof app.use>): ReturnType<typeof app.use> {
      const [first, ...rest] = args as [unknown, ...MiddlewareHandler[]];

      if (typeof first === 'string') {
        const wrappedHandlers = rest.map(handler => wrapMiddlewareWithSpan(handler, MIDDLEWARE_IDX++));
        return Reflect.apply(target, thisArg, [first, ...wrappedHandlers]);
      }

      const allHandlers = [first as MiddlewareHandler, ...rest].map(handler =>
        wrapMiddlewareWithSpan(handler, MIDDLEWARE_IDX++),
      );
      return Reflect.apply(target, thisArg, allHandlers);
    },
  });
}

/**
 * Wraps a Hono middleware handler so that its execution is traced as a Sentry span.
 * Uses startInactiveSpan so that all middleware spans are siblings under the request/transaction
 * (onion order: A → B → handler → B → A does not nest B under A in the trace).
 */
function wrapMiddlewareWithSpan(handler: MiddlewareHandler, index: number): MiddlewareHandler {
  const spanName = handler.name || `<anonymous.${index}>`;

  return async function sentryTracedMiddleware(context, next) {
    const span = startInactiveSpan({
      name: spanName,
      op: 'middleware.hono',
      onlyIfParent: true,
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
