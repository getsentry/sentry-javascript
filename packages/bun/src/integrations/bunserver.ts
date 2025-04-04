import type { IntegrationFn, RequestEventData, SpanAttributes } from '@sentry/core';
import type { BunRequest, ServeOptions } from 'bun';
import {
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  defineIntegration,
  extractQueryParamsFromUrl,
  getSanitizedUrlString,
  parseUrl,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';

const INTEGRATION_NAME = 'BunServer';

const _bunServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentBunServe();
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments `Bun.serve` to automatically create transactions and capture errors.
 *
 * Enabled by default in the Bun SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.bunServerIntegration(),
 *   ],
 * })
 * ```
 */
export const bunServerIntegration = defineIntegration(_bunServerIntegration);

let originalServe: typeof Bun.serve;

/**
 * Instruments Bun.serve by patching it's options.
 */
export function instrumentBunServe(): void {
  if (!originalServe) {
    originalServe = Bun.serve;
  }

  Bun.serve = new Proxy(originalServe, {
    apply(serveTarget, serveThisArg, serveArgs: Parameters<typeof Bun.serve>) {
      instrumentBunServeOptions(serveArgs[0]);
      const server: ReturnType<typeof Bun.serve> = serveTarget.apply(serveThisArg, serveArgs);

      // A Bun server can be reloaded, re-wrap any fetch function passed to it
      // We can't use a Proxy for this as Bun does `instanceof` checks internally that fail if we
      // wrap the Server instance.
      const originalReload: typeof server.reload = server.reload.bind(server);
      server.reload = (serveOptions: ServeOptions) => {
        instrumentBunServeOptions(serveOptions);
        return originalReload(serveOptions);
      };

      return server;
    },
  });
}

/**
 * Instruments Bun.serve `fetch` option to automatically create spans and capture errors.
 */
function instrumentBunServeOptions(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  const originalFetch: typeof serveOptions.fetch = serveOptions?.fetch;
  // Instrument the fetch handler
  if (typeof originalFetch === 'function') {
    serveOptions.fetch = new Proxy(originalFetch, {
      apply(fetchTarget, fetchThisArg, fetchArgs: Parameters<typeof originalFetch>) {
        return withIsolationScope(isolationScope => {
          const request = fetchArgs[0];
          const upperCaseMethod = request.method.toUpperCase();
          if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
            return fetchTarget.apply(fetchThisArg, fetchArgs);
          }

          const parsedUrl = parseUrl(request.url);
          const attributes: SpanAttributes = {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve',
            [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method || 'GET',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          };
          if (parsedUrl.search) {
            attributes['http.query'] = parsedUrl.search;
          }

          const url = getSanitizedUrlString(parsedUrl);

          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: {
              url,
              method: request.method,
              headers: request.headers.toJSON(),
              query_string: extractQueryParamsFromUrl(url),
            } satisfies RequestEventData,
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
                    const response = await (fetchTarget.apply(fetchThisArg, fetchArgs) as ReturnType<
                      typeof originalFetch
                    >);
                    if (response?.status) {
                      setHttpStatus(span, response.status);
                      isolationScope.setContext('response', {
                        headers: response.headers.toJSON(),
                        status_code: response.status,
                      });
                    }
                    return response;
                  } catch (e) {
                    captureException(e, {
                      mechanism: {
                        type: 'bun',
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

  // Instrument routes if present
  if (
    (typeof serveOptions?.routes === 'object' || typeof serveOptions?.routes === 'function') &&
    // Hono routes. This was an issue in Bun.
    !Array.isArray(serveOptions?.routes)
  ) {
    serveOptions.routes = instrumentBunServeRoutes(serveOptions.routes) as typeof serveOptions.routes;
  }
}

/**
 * Instruments the routes option in Bun.serve()
 */
function instrumentBunServeRoutes(
  routes: NonNullable<Parameters<typeof Bun.serve>[0]['routes']>,
): Parameters<typeof Bun.serve>[0]['routes'] {
  let anyMatches = false;
  const instrumentedRoutes: Parameters<typeof Bun.serve>[0]['routes'] = {};

  for (const [routePath, handler] of Object.entries(routes)) {
    if (handler === null || handler === undefined || !routePath.startsWith('/')) {
      instrumentedRoutes[routePath] = handler;
      continue;
    }

    // Case 2: Route handler function
    if (typeof handler === 'function') {
      anyMatches = true;
      instrumentedRoutes[routePath] = new Proxy(handler, {
        apply(handlerTarget, handlerThisArg, handlerArgs) {
          return withIsolationScope(isolationScope => {
            const request = handlerArgs[0] as BunRequest;
            const upperCaseMethod = request.method.toUpperCase();
            if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
              return handlerTarget.apply(handlerThisArg, handlerArgs);
            }

            const parsedUrl = parseUrl(request.url);
            const attributes: SpanAttributes = {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve.route',
              [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method || 'GET',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            };
            if (parsedUrl.search) {
              attributes['http.query'] = parsedUrl.search;
            }

            const url = getSanitizedUrlString(parsedUrl);

            isolationScope.setSDKProcessingMetadata({
              normalizedRequest: {
                url,
                method: request.method,
                headers: request.headers.toJSON(),
                query_string: extractQueryParamsFromUrl(url),
                // For routes with parameters, add them to request data
                ...(request.params ? { params: request.params } : {}),
              } satisfies RequestEventData,
            });

            return continueTrace(
              { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
              () => {
                // Use routePath for the name to capture route parameters
                return startSpan(
                  {
                    attributes,
                    op: 'http.server',
                    name: `${request.method} ${routePath}`,
                  },
                  async span => {
                    try {
                      const response = await (handlerTarget.apply(handlerThisArg, handlerArgs) as
                        | Promise<Response>
                        | Response);
                      if (response?.status) {
                        setHttpStatus(span, response.status);
                        isolationScope.setContext('response', {
                          headers: response.headers.toJSON(),
                          status_code: response.status,
                        });
                      }
                      return response;
                    } catch (e) {
                      captureException(e, {
                        mechanism: {
                          type: 'bun',
                          handled: false,
                          data: {
                            function: 'serve.route',
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
      continue;
    }

    // Case 3: HTTP method handlers object { GET: fn, POST: fn, ... }
    if (typeof handler === 'object') {
      const methodHandlers = handler as Record<string, unknown>;
      const instrumentedMethodHandlers: Record<string, unknown> = {};

      for (const [method, methodHandler] of Object.entries(methodHandlers)) {
        if (typeof methodHandler === 'function') {
          anyMatches = true;
          instrumentedMethodHandlers[method] = new Proxy(methodHandler, {
            apply(methodHandlerTarget, methodHandlerThisArg, methodHandlerArgs) {
              return withIsolationScope(isolationScope => {
                const request = methodHandlerArgs[0] as BunRequest;
                const upperCaseMethod = method.toUpperCase();
                if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
                  return methodHandlerTarget.apply(methodHandlerThisArg, methodHandlerArgs);
                }

                const parsedUrl = parseUrl(request.url);
                const attributes: SpanAttributes = {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve.route.method',
                  [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: upperCaseMethod,
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                };
                if (parsedUrl.search) {
                  attributes['http.query'] = parsedUrl.search;
                }

                const url = getSanitizedUrlString(parsedUrl);

                isolationScope.setSDKProcessingMetadata({
                  normalizedRequest: {
                    url,
                    method: upperCaseMethod,
                    headers: request.headers.toJSON(),
                    query_string: extractQueryParamsFromUrl(url),
                    // For routes with parameters, add them to request data
                    ...(request.params ? { params: request.params } : {}),
                  } satisfies RequestEventData,
                });

                return continueTrace(
                  { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
                  () => {
                    return startSpan(
                      {
                        attributes,
                        op: 'http.server',
                        name: `${upperCaseMethod} ${routePath}`,
                      },
                      async span => {
                        try {
                          const response = await (methodHandlerTarget.apply(methodHandlerThisArg, methodHandlerArgs) as
                            | Promise<Response>
                            | Response);
                          if (response?.status) {
                            setHttpStatus(span, response.status);
                            isolationScope.setContext('response', {
                              headers: response.headers.toJSON(),
                              status_code: response.status,
                            });
                          }
                          return response;
                        } catch (e) {
                          captureException(e, {
                            mechanism: {
                              type: 'bun',
                              handled: false,
                              data: {
                                function: 'serve.route.method',
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
        } else {
          // If method handler is not a function (e.g., static response), keep it as is
          instrumentedMethodHandlers[method] = methodHandler;
        }
      }

      instrumentedRoutes[routePath] = instrumentedMethodHandlers;
      continue;
    }

    // Default case: keep the handler as is if it's not a recognized type
    instrumentedRoutes[routePath] = handler;
  }

  if (!anyMatches) {
    return routes;
  }

  return instrumentedRoutes;
}
