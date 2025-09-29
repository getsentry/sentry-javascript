import {
  type SpanAttributes,
  captureException,
  debug,
  flushIfServerless,
  getClient,
  httpHeadersToSpanAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_OK,
  startSpan,
} from '@sentry/core';
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3';

/**
 * Wraps a middleware handler with Sentry instrumentation.
 *
 * @param handler The middleware handler.
 * @param fileName The name of the middleware file.
 */
export function wrapMiddlewareHandler(handler: EventHandler, fileName: string) {
  return async (event: H3Event<EventHandlerRequest>) => {
    debug.log(`Sentry middleware: ${fileName} handling ${event.path}`);

    const attributes = getSpanAttributes(event, fileName);

    return startSpan(
      {
        name: fileName,
        attributes,
      },
      async span => {
        try {
          const result = await handler(event);
          span.setStatus({ code: SPAN_STATUS_OK });

          return result;
        } catch (error) {
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
  };
}

/**
 * Gets the span attributes for the middleware handler based on the event.
 */
function getSpanAttributes(event: H3Event<EventHandlerRequest>, fileName: string): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nuxt',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nuxt',
    'nuxt.middleware.name': fileName,
  };

  // Add HTTP method
  if (event.method) {
    attributes['http.request.method'] = event.method;
  }

  // Add route information
  if (event.path) {
    attributes['http.route'] = event.path;
  }

  // Extract and add HTTP headers as span attributes
  const client = getClient();
  const sendDefaultPii = client?.getOptions().sendDefaultPii ?? false;

  // Get headers from the Node.js request object
  const headers = event.node?.req?.headers || {};
  const headerAttributes = httpHeadersToSpanAttributes(headers, sendDefaultPii);

  // Merge header attributes with existing attributes
  Object.assign(attributes, headerAttributes);

  return attributes;
}
