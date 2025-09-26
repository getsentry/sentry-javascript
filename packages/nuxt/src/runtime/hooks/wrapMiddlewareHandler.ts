import {
  type RequestEventData,
  type SpanAttributes,
  captureException,
  debug,
  flushIfServerless,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  httpHeadersToSpanAttributes,
  httpRequestToRequestData,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpan,
  withIsolationScope,
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

    const isolationScope = getIsolationScope();
    const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;
    const normalizedRequest = createNormalizedRequestData(event);
    newIsolationScope.setSDKProcessingMetadata({
      normalizedRequest,
    });

    const attributes = getSpanAttributes(event);

    return withIsolationScope(newIsolationScope, async () => {
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
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            span.recordException(error);
            captureException(error, {
              mechanism: {
                handled: false,
                type: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
              },
            });
            span.end();

            // Re-throw the error to be handled by the caller
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    });
  };
}

/**
 * Creates the normalized request data for the middleware handler based on the event.
 */
function createNormalizedRequestData(event: H3Event<EventHandlerRequest>): RequestEventData {
  // Extract headers from the Node.js request object
  const headers = event.node?.req?.headers || {};

  return httpRequestToRequestData({
    method: event.method,
    url: event.path || event.node?.req?.url,
    headers,
  });
}

/**
 * Gets the span attributes for the middleware handler based on the event.
 */
function getSpanAttributes(event: H3Event<EventHandlerRequest>): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server.middleware',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.nuxt',
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
