import {
  captureException,
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import { isAlreadyCaptured } from './responseUtils';
import type { DecodedPayload, RouteRSCServerRequestArgs, RouteRSCServerRequestFn, RSCPayload } from './types';

/**
 * Wraps `unstable_routeRSCServerRequest` from react-router with Sentry error and performance instrumentation.
 *
 * @experimental This API is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * @param originalFn - The original `unstable_routeRSCServerRequest` function from react-router
 *
 * @example
 * ```ts
 * import { unstable_routeRSCServerRequest as routeRSCServerRequest } from "react-router";
 * import { wrapRouteRSCServerRequest } from "@sentry/react-router";
 *
 * const sentryRouteRSCServerRequest = wrapRouteRSCServerRequest(routeRSCServerRequest);
 * ```
 */
export function wrapRouteRSCServerRequest(originalFn: RouteRSCServerRequestFn): RouteRSCServerRequestFn {
  return async function sentryWrappedRouteRSCServerRequest(args: RouteRSCServerRequestArgs): Promise<Response> {
    const { request, renderHTML, fetchServer, ...rest } = args;

    const url = new URL(request.url);
    const isolationScope = getIsolationScope();
    isolationScope.setTransactionName(`RSC SSR ${request.method} ${url.pathname}`);

    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const rootSpan = getRootSpan(activeSpan);
      if (rootSpan) {
        rootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc.ssr',
          'rsc.ssr_request': true,
        });
      }
    }

    // Wrapped fetchServer that traces the RSC server fetch
    const wrappedFetchServer = async (req: Request): Promise<Response> => {
      return startSpan(
        {
          name: 'RSC Fetch Server',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client.rsc',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.rsc.fetch',
          },
        },
        async span => {
          try {
            const response = await fetchServer(req);
            span.setAttributes({
              'http.response.status_code': response.status,
            });
            return response;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            if (!isAlreadyCaptured(error)) {
              captureException(error, {
                mechanism: {
                  type: 'instrument',
                  handled: false,
                  data: {
                    function: 'fetchServer',
                  },
                },
              });
            }
            throw error;
          }
        },
      );
    };

    // Wrapped renderHTML that traces the SSR rendering phase
    const wrappedRenderHTML = (
      getPayload: () => DecodedPayload & Promise<RSCPayload>,
    ): ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>> => {
      return startSpan(
        {
          name: 'RSC SSR Render HTML',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.ssr.render',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc.ssr',
          },
        },
        async span => {
          try {
            const result = await renderHTML(getPayload);
            return result;
          } catch (error) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            if (!isAlreadyCaptured(error)) {
              captureException(error, {
                mechanism: {
                  type: 'instrument',
                  handled: false,
                  data: {
                    function: 'renderHTML',
                  },
                },
              });
            }
            throw error;
          }
        },
      );
    };

    try {
      return await originalFn({
        ...rest,
        request,
        fetchServer: wrappedFetchServer,
        renderHTML: wrappedRenderHTML,
      });
    } catch (error) {
      // Only capture errors that weren't already captured by inner wrappers
      if (!isAlreadyCaptured(error)) {
        captureException(error, {
          mechanism: {
            type: 'instrument',
            handled: false,
            data: {
              function: 'routeRSCServerRequest',
            },
          },
        });
      }
      throw error;
    }
  };
}
