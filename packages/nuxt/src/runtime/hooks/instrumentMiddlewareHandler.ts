import {
  debug,
  flushIfServerless,
  getDefaultIsolationScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3';

/**
 * Instruments a middleware handler.
 *
 * @param handler The middleware handler.
 * @param fileName The name of the middleware file.
 */
export function instrumentMiddlewareHandler(handler: EventHandler, fileName: string) {
  return async (event: H3Event<EventHandlerRequest>) => {
    const middlewarePath = event?.path || event?.node?.req?.url || 'unknown';

    debug.log(`Sentry middleware: ${fileName} handling ${middlewarePath}`);

    const isolationScope = getIsolationScope();
    const newIsolationScope = isolationScope === getDefaultIsolationScope() ? isolationScope.clone() : isolationScope;

    return withIsolationScope(newIsolationScope, async () => {
      return startSpan(
        {
          name: `middleware.${fileName}`,
          op: 'middleware.nitro',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
            'middleware.name': fileName,
            'middleware.path': middlewarePath,
          },
        },
        async span => {
          try {
            const result = await handler(event);
            span.setStatus({ code: SPAN_STATUS_OK });
            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            span.recordException(error);
            throw error;
          } finally {
            await flushIfServerless();
          }
        },
      );
    });
  };
}
