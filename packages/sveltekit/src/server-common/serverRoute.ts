import {
  addNonEnumerableProperty,
  FUNCTION_SPAN_NAME_FALLBACK,
  getClient,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
} from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import {
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import type { RequestEvent } from '@sveltejs/kit';
import { sendErrorToSentry } from './utils';

type PatchedServerRouteEvent = RequestEvent & { __sentry_wrapped__?: boolean };

/**
 * Wraps a server route handler for API or server routes registered in `+server.(js|js)` files.
 *
 * This function will automatically capture any errors that occur during the execution of the route handler
 * and it will start a span for the duration of your route handler.
 *
 * @example
 * ```js
 * import { wrapServerRouteWithSentry } from '@sentry/sveltekit';
 *
 * const get = async event => {
 *   return new Response(JSON.stringify({ message: 'hello world' }));
 * }
 *
 * export const GET = wrapServerRouteWithSentry(get);
 * ```
 *
 * @param originalRouteHandler your server route handler
 * @param httpMethod the HTTP method of your route handler
 *
 * @returns a wrapped version of your server route handler
 */
export function wrapServerRouteWithSentry<T extends RequestEvent>(
  originalRouteHandler: (request: T) => Promise<Response>,
): (requestEvent: T) => Promise<Response> {
  return new Proxy(originalRouteHandler, {
    apply: async (wrappingTarget, thisArg, args) => {
      const event = args[0] as PatchedServerRouteEvent;

      if (event.__sentry_wrapped__) {
        return wrappingTarget.apply(thisArg, args);
      }

      const routeId = event.route?.id;
      const httpMethod = event.request.method;
      const methodAndRoute = `${httpMethod} ${routeId || 'Server Route'}`;

      addNonEnumerableProperty(event, '__sentry_wrapped__', true);

      const client = getClient();
      const hasSpanStreaming = !!client && hasSpanStreamingEnabled(client);

      try {
        return await startSpan(
          {
            // With span streaming, span names have to be low cardinality, so we use the handler's
            // function name, which for `+server.js` routes is the HTTP method it is exported as.
            name: hasSpanStreaming ? httpMethod || FUNCTION_SPAN_NAME_FALLBACK : methodAndRoute,
            attributes: {
              [SENTRY_OP]: FUNCTION,
              [CODE_FUNCTION_NAME]: httpMethod,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
              [HTTP_REQUEST_METHOD]: httpMethod,
              ...(routeId && { [HTTP_ROUTE]: routeId }),
              // Relay infers the description from `code.function.name`, which would drop the route.
              ...(hasSpanStreaming && { [SENTRY_DESCRIPTION]: methodAndRoute }),
            },
            onlyIfParent: true,
          },
          () => wrappingTarget.apply(thisArg, args),
        );
      } catch (e) {
        sendErrorToSentry(e, 'server_route');
        throw e;
      } finally {
        await flushIfServerless();
      }
    },
  });
}
