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

type RequestMiddleware = (event: H3Event<EventHandlerRequest>) => void | Promise<void>;
type HookName = 'onRequest' | 'onBeforeResponse' | 'middleware';

// Broader handler object type covering both h3 v1 and h3 v2 shapes.
type EventHandlerObjectH3 = EventHandlerObject & {
  // h3 v1 (Nitro v2): onRequest, onBeforeResponse, handler (required)
  onRequest?: RequestMiddleware | RequestMiddleware[];
  onBeforeResponse?: ResponseMiddleware | ResponseMiddleware[];

  // h3 v2 (Nitro v3): middleware[], handler (optional), fetch, meta
  middleware?: EventHandler[];
};

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

  const handlerObj = handler as EventHandlerObjectH3;

  const result: EventHandlerObjectH3 = {
    ...handlerObj,
    ...(handlerObj.handler && { handler: wrapEventHandler(handlerObj.handler, fileName) }),
  };

  // h3 v1 (Nitro v2): onRequest and response hooks
  if (result.onRequest) {
    result.onRequest = normalizeHandlers(result.onRequest, (h, index) =>
      wrapEventHandler(h as EventHandler, fileName, 'onRequest', index),
    );
  }

  if (result.onBeforeResponse) {
    result.onBeforeResponse = normalizeHandlers(result.onBeforeResponse, (h, index) =>
      wrapResponseHandler(h, fileName, index),
    );
  }

  // h3 v2 (Nitro v3): middleware array replaces onRequest/onBeforeResponse
  if (result.middleware?.length) {
    result.middleware = result.middleware.map((h, index) => wrapEventHandler(h, fileName, 'middleware', index));
  }

  return result as THandler;
}

/**
 * Wraps a callable event handler with Sentry instrumentation.
 */
function wrapEventHandler(
  handler: EventHandler,
  middlewareName: string,
  hookName?: HookName,
  index?: number,
): EventHandler {
  return async (event: H3Event<EventHandlerRequest>) => {
    debug.log(`Sentry middleware: ${middlewareName}${hookName ? `.${hookName}` : ''} handling ${event.path}`);

    const attributes = getSpanAttributes(event, middlewareName, hookName, index);

    return withSpan(() => handler(event), attributes, middlewareName, hookName);
  };
}

/**
 * Wraps a middleware response handler with Sentry instrumentation (h3 v1 only).
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
  hookName?: HookName | 'handler',
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
function normalizeHandlers<T>(handlers: T | T[], normalizer: (h: T, index?: number) => T): T | T[] {
  return Array.isArray(handlers) ? handlers.map((handler, index) => normalizer(handler, index)) : normalizer(handlers);
}

/**
 * Gets the span attributes for the middleware handler based on the event.
 */
function getSpanAttributes(
  event: H3Event<EventHandlerRequest>,
  middlewareName: string,
  hookName?: HookName | 'handler',
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

  // oxlint-disable-next-line typescript/no-explicit-any
  const eventH3v2 = event as any;
  // oxlint-disable-next-line @typescript-oxlint/no-unsafe-member-access
  const method = event.method ?? eventH3v2?.req?.method;
  // oxlint-disable-next-line @typescript-oxlint/no-unsafe-member-access
  const path = event.path ?? eventH3v2?.url?.pathname;

  if (method) {
    attributes['http.request.method'] = method;
  }

  if (path) {
    attributes['http.route'] = path;
  }

  // h3 v1 (Nuxt 4): headers are on event.node.req.headers
  // h3 v2 (Nuxt 5): headers are on event.req.headers
  let headers: Record<string, string | string[] | undefined> = event.node?.req?.headers || {};

  // oxlint-disable-next-line @typescript-oxlint/no-unsafe-member-access
  if (!Object.keys(headers).length && eventH3v2?.req?.headers instanceof Headers) {
    // oxlint-disable-next-line @typescript-oxlint/no-unsafe-member-access
    headers = Object.fromEntries(eventH3v2?.req.headers.entries());
  }

  const headerAttributes = httpHeadersToSpanAttributes(headers, getClient()?.getOptions().sendDefaultPii ?? false);

  // Merge header attributes with existing attributes
  Object.assign(attributes, headerAttributes);

  return attributes;
}

/**
 * Checks if the handler is an event handler object, util for type narrowing.
 */
function isEventHandlerObject(handler: EventHandler | EventHandlerObject): handler is EventHandlerObject {
  return typeof handler !== 'function';
}
