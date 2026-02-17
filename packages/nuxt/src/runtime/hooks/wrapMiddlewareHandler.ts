import {
  captureException,
  debug,
  flushIfServerless,
  getClient,
  httpHeadersToSpanAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  type SpanAttributes,
  startSpan,
} from '@sentry/core';
import type {
  _ResponseMiddleware as ResponseMiddleware,
  EventHandler,
  EventHandlerObject,
  EventHandlerRequest,
  EventHandlerResponse,
  H3Event,
} from 'h3';

/**
 * Wraps a middleware handler with Sentry instrumentation.
 *
 * @param handler The middleware handler.
 * @param fileName The name of the middleware file.
 */
export function wrapMiddlewareHandlerWithSentry<THandler extends EventHandler | EventHandlerObject>(
  handler: THandler,
  fileName: string,
): THandler {
  if (!isEventHandlerObject(handler)) {
    return wrapEventHandler(handler, fileName) as THandler;
  }

  const handlerObj = {
    ...handler,
    handler: wrapEventHandler(handler.handler, fileName),
  };

  if (handlerObj.onRequest) {
    handlerObj.onRequest = normalizeHandlers(handlerObj.onRequest, (h, index) =>
      wrapEventHandler(h, fileName, 'onRequest', index),
    );
  }

  if (handlerObj.onBeforeResponse) {
    handlerObj.onBeforeResponse = normalizeHandlers(handlerObj.onBeforeResponse, (h, index) =>
      wrapResponseHandler(h, fileName, index),
    );
  }

  return handlerObj;
}

/**
 * Wraps a callable event handler with Sentry instrumentation.
 *
 * @param handler The event handler.
 * @param handlerName The name of the event handler to be used for the span name and logging.
 */
function wrapEventHandler(
  handler: EventHandler,
  middlewareName: string,
  hookName?: 'onRequest',
  index?: number,
): EventHandler {
  return async (event: H3Event<EventHandlerRequest>) => {
    debug.log(`Sentry middleware: ${middlewareName}${hookName ? `.${hookName}` : ''} handling ${event.path}`);

    const attributes = getSpanAttributes(event, middlewareName, hookName, index);

    return withSpan(() => handler(event), attributes, middlewareName, hookName);
  };
}

/**
 * Wraps a middleware response handler with Sentry instrumentation.
 */
function wrapResponseHandler(handler: ResponseMiddleware, middlewareName: string, index?: number): ResponseMiddleware {
  return async (event: H3Event<EventHandlerRequest>, response: EventHandlerResponse) => {
    debug.log(`Sentry middleware: ${middlewareName}.onBeforeResponse handling ${event.path}`);

    const attributes = getSpanAttributes(event, middlewareName, 'onBeforeResponse', index);

    return withSpan(() => handler(event, response), attributes, middlewareName, 'onBeforeResponse');
  };
}

/**
 * Wraps a middleware or event handler execution with a span.
 */
function withSpan<TResult>(
  handler: () => TResult | Promise<TResult>,
  attributes: SpanAttributes,
  middlewareName: string,
  hookName?: 'handler' | 'onRequest' | 'onBeforeResponse',
): Promise<TResult> {
  const spanName = hookName && hookName !== 'handler' ? `${middlewareName}.${hookName}` : middlewareName;

  return startSpan(
    {
      name: spanName,
      attributes,
    },
    async span => {
      try {
        const result = await handler();
        span.setStatus({ code: SPAN_STATUS_OK });

        return result;
      } catch (error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        captureException(error, {
          mechanism: {
            handled: false,
            type: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
          },
        });

        // Re-throw the error to be handled by the caller
        throw error;
      } finally {
        await flushIfServerless();
      }
    },
  );
}

/**
 * Takes a list of handlers and wraps them with the normalizer function.
 */
function normalizeHandlers<T extends EventHandler | ResponseMiddleware>(
  handlers: T | T[],
  normalizer: (h: T, index?: number) => T,
): T | T[] {
  return Array.isArray(handlers) ? handlers.map((handler, index) => normalizer(handler, index)) : normalizer(handlers);
}

/**
 * Gets the span attributes for the middleware handler based on the event.
 */
function getSpanAttributes(
  event: H3Event<EventHandlerRequest>,
  middlewareName: string,
  hookName?: 'handler' | 'onRequest' | 'onBeforeResponse',
  index?: number,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nuxt',
    'nuxt.middleware.name': middlewareName,
    'nuxt.middleware.hook.name': hookName ?? 'handler',
  };

  // Add index for array handlers
  if (typeof index === 'number') {
    attributes['nuxt.middleware.hook.index'] = index;
  }

  // Add HTTP method
  if (event.method) {
    attributes['http.request.method'] = event.method;
  }

  // Add route information
  if (event.path) {
    attributes['http.route'] = event.path;
  }

  // Get headers from the Node.js request object
  const headers = event.node?.req?.headers || {};
  const headerAttributes = httpHeadersToSpanAttributes(headers, getClient()?.getOptions().sendDefaultPii ?? false);

  // Merge header attributes with existing attributes
  Object.assign(attributes, headerAttributes);

  return attributes;
}

/**
 * Checks if the handler is an event handler, util for type narrowing.
 */
function isEventHandlerObject(handler: EventHandler | EventHandlerObject): handler is EventHandlerObject {
  return typeof handler !== 'function';
}
