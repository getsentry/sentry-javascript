import type { IntegrationFn, RequestEventData, SpanAttributes } from '@sentry/core';
import {
  captureException,
  continueTrace,
  defineIntegration,
  getClient,
  httpHeadersToSpanAttributes,
  isURLObjectRelative,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { ServeOptions } from 'bun';

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
 * Does not support instrumenting static routes.
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

let hasPatchedBunServe = false;

/**
 * Instruments Bun.serve by patching it's options.
 *
 * Only exported for tests.
 */
export function instrumentBunServe(): void {
  if (hasPatchedBunServe) {
    return;
  }

  Bun.serve = new Proxy(Bun.serve, {
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

  hasPatchedBunServe = true;
}

/**
 * Instruments Bun.serve options.
 *
 * @param serveOptions - The options for the Bun.serve function.
 */
function instrumentBunServeOptions(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  // First handle fetch
  instrumentBunServeOptionFetch(serveOptions);
  // then handle routes
  instrumentBunServeOptionRoutes(serveOptions);
}

/**
 * Instruments the `fetch` option of Bun.serve.
 *
 * @param serveOptions - The options for the Bun.serve function.
 */
function instrumentBunServeOptionFetch(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  if (typeof serveOptions.fetch !== 'function') {
    return;
  }

  serveOptions.fetch = new Proxy(serveOptions.fetch, {
    apply(fetchTarget, fetchThisArg, fetchArgs: Parameters<typeof serveOptions.fetch>) {
      return wrapRequestHandler(fetchTarget, fetchThisArg, fetchArgs);
    },
  });
}

/**
 * Instruments the `routes` option of Bun.serve.
 *
 * @param serveOptions - The options for the Bun.serve function.
 */
function instrumentBunServeOptionRoutes(serveOptions: Parameters<typeof Bun.serve>[0]): void {
  if (!serveOptions.routes) {
    return;
  }

  if (typeof serveOptions.routes !== 'object') {
    return;
  }

  Object.keys(serveOptions.routes).forEach(route => {
    const routeHandler = serveOptions.routes[route];

    // Handle route handlers that are an object
    if (typeof routeHandler === 'function') {
      serveOptions.routes[route] = new Proxy(routeHandler, {
        apply: (routeHandlerTarget, routeHandlerThisArg, routeHandlerArgs: Parameters<typeof routeHandler>) => {
          return wrapRequestHandler(routeHandlerTarget, routeHandlerThisArg, routeHandlerArgs, route);
        },
      });
    }

    // Static routes are not instrumented
    if (routeHandler instanceof Response) {
      return;
    }

    // Handle the route handlers that are an object. This means they define a route handler for each method.
    if (typeof routeHandler === 'object') {
      Object.entries(routeHandler).forEach(([routeHandlerObjectHandlerKey, routeHandlerObjectHandler]) => {
        if (typeof routeHandlerObjectHandler === 'function') {
          (serveOptions.routes[route] as Record<string, RouteHandler>)[routeHandlerObjectHandlerKey] = new Proxy(
            routeHandlerObjectHandler,
            {
              apply: (
                routeHandlerObjectHandlerTarget,
                routeHandlerObjectHandlerThisArg,
                routeHandlerObjectHandlerArgs: Parameters<typeof routeHandlerObjectHandler>,
              ) => {
                return wrapRequestHandler(
                  routeHandlerObjectHandlerTarget,
                  routeHandlerObjectHandlerThisArg,
                  routeHandlerObjectHandlerArgs,
                  route,
                );
              },
            },
          );
        }
      });
    }
  });
}

type RouteHandler = Extract<
  NonNullable<Parameters<typeof Bun.serve>[0]['routes']>[string],
  // eslint-disable-next-line @typescript-eslint/ban-types
  Function
>;

function wrapRequestHandler<T extends RouteHandler = RouteHandler>(
  target: T,
  thisArg: unknown,
  args: Parameters<T>,
  route?: string,
): ReturnType<T> {
  return withIsolationScope(isolationScope => {
    const request = args[0];
    const upperCaseMethod = request.method.toUpperCase();
    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      return target.apply(thisArg, args);
    }

    const parsedUrl = parseStringToURLObject(request.url);
    const attributes = getSpanAttributesFromParsedUrl(parsedUrl, request);

    let routeName = parsedUrl?.pathname || '/';
    if (request.params) {
      Object.keys(request.params).forEach(key => {
        attributes[`url.path.parameter.${key}`] = (request.params as Record<string, string>)[key];
      });

      // If a route has parameters, it's a parameterized route
      if (route) {
        attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'route';
        attributes['url.template'] = route;
        routeName = route;
      }
    }

    // Handle wildcard routes
    if (route?.endsWith('/*')) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'route';
      attributes['url.template'] = route;
      routeName = route;
    }

    Object.assign(
      attributes,
      httpHeadersToSpanAttributes(request.headers.toJSON(), getClient()?.getOptions().sendDefaultPii ?? false),
    );

    isolationScope.setSDKProcessingMetadata({
      normalizedRequest: {
        url: request.url,
        method: request.method,
        headers: request.headers.toJSON(),
        query_string: parsedUrl?.search,
      } satisfies RequestEventData,
    });

    return continueTrace(
      {
        sentryTrace: request.headers.get('sentry-trace') ?? '',
        baggage: request.headers.get('baggage'),
      },
      () =>
        startSpan(
          {
            attributes,
            op: 'http.server',
            name: `${request.method} ${routeName}`,
          },
          async span => {
            try {
              const response = (await target.apply(thisArg, args)) as Response | undefined;
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
                  type: 'auto.http.bun.serve',
                  handled: false,
                },
              });
              throw e;
            }
          },
        ),
    );
  });
}

function getSpanAttributesFromParsedUrl(
  parsedUrl: ReturnType<typeof parseStringToURLObject>,
  request: Request,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.bun.serve',
    [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method || 'GET',
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
  };

  if (parsedUrl) {
    if (parsedUrl.search) {
      attributes['url.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      attributes['url.fragment'] = parsedUrl.hash;
    }
    if (parsedUrl.pathname) {
      attributes['url.path'] = parsedUrl.pathname;
    }
    if (!isURLObjectRelative(parsedUrl)) {
      attributes['url.full'] = parsedUrl.href;
      if (parsedUrl.port) {
        attributes['url.port'] = parsedUrl.port;
      }
      if (parsedUrl.protocol) {
        attributes['url.scheme'] = parsedUrl.protocol;
      }
      if (parsedUrl.hostname) {
        attributes['url.domain'] = parsedUrl.hostname;
      }
    }
  }

  return attributes;
}
