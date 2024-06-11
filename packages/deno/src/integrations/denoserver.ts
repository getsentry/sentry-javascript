import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  defineIntegration,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { IntegrationFn, SpanAttributes } from '@sentry/types';
import { getSanitizedUrlString, parseUrl } from '@sentry/utils';

type RawHandler = (request: Request, info: Deno.ServeHandlerInfo) => Response | Promise<Response>;

const INTEGRATION_NAME = 'DenoServer';

const _denoServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentDenoServe();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments `Deno.serve` to automatically create transactions and capture errors.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.denoServerIntegration(),
 *   ],
 * })
 * ```
 */
export const denoServerIntegration = defineIntegration(_denoServerIntegration);

/**
 * Instruments Deno.serve by patching it's options.
 */
export function instrumentDenoServe(): void {
  Deno.serve = new Proxy(Deno.serve, {
    apply(serveTarget, serveThisArg, serveArgs: unknown[]) {
      const [arg1, arg2] = serveArgs;

      if (typeof arg1 === 'function') {
        serveArgs[0] = instrumentDenoServeOptions(arg1 as RawHandler);
      } else if (typeof arg2 === 'function') {
        serveArgs[1] = instrumentDenoServeOptions(arg2 as RawHandler);
      } else if (arg1 && typeof arg1 === 'object' && 'handler' in arg1 && typeof arg1.handler === 'function') {
        arg1.handler = instrumentDenoServeOptions(arg1.handler as RawHandler);
      }

      return serveTarget.apply(serveThisArg, serveArgs as Parameters<typeof Deno.serve>);
    },
  });
}

/**
 * Instruments Deno.serve handler to automatically create spans and capture errors.
 */
function instrumentDenoServeOptions(handler: RawHandler): RawHandler {
  return new Proxy(handler, {
    apply(handlerTarget, handlerThisArg, handlerArgs: Parameters<RawHandler>) {
      return withIsolationScope(isolationScope => {
        isolationScope.clear();

        const request = handlerArgs[0];
        if (request.method === 'OPTIONS' || request.method === 'HEAD') {
          return handlerTarget.apply(handlerThisArg, handlerArgs);
        }

        const parsedUrl = parseUrl(request.url);
        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.deno.serve',
          'http.request.method': request.method || 'GET',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        };
        if (parsedUrl.search) {
          attributes['http.query'] = parsedUrl.search;
        }

        const url = getSanitizedUrlString(parsedUrl);

        isolationScope.setSDKProcessingMetadata({
          request: {
            url,
            method: request.method,
            headers: Object.fromEntries(request.headers),
          },
        });

        return continueTrace(
          { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
          () => {
            return startSpan(
              {
                attributes,
                op: 'http.server',
                name: `${request.method} ${parsedUrl.path || '/'}`,
              },
              async span => {
                try {
                  const response = await (handlerTarget.apply(handlerThisArg, handlerArgs) as ReturnType<RawHandler>);
                  if (response && response.status) {
                    setHttpStatus(span, response.status);
                    isolationScope.setContext('response', {
                      headers: Object.fromEntries(response.headers),
                      status_code: response.status,
                    });
                  }
                  return response;
                } catch (e) {
                  captureException(e, {
                    mechanism: {
                      type: 'deno',
                      handled: false,
                      data: {
                        function: 'serve',
                      },
                    },
                  });
                  throw e;
                }
              },
            );
          },
        );
      });
    },
  });
}
