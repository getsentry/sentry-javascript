/* eslint-disable max-lines */
import type { Client, Integration, IntegrationFn, MaxRequestBodySize, Span, SpanAttributes } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  captureException,
  continueTrace,
  debug,
  defineIntegration,
  getClient,
  getUrlFragment,
  getUrlQuery,
  hasSpansEnabled,
  hasSpanStreamingEnabled,
  httpHeadersToSpanAttributes,
  HTTP_SPAN_NAME_FALLBACK,
  isURLObjectRelative,
  parseStringToURLObject,
  setHttpStatus,
  SPAN_STATUS_ERROR,
  startSpanManual,
  winterCGRequestToRequestData,
  withIsolationScope,
  filterCollectedUrl,
  filterCollectedUrlQuery,
} from '@sentry/core';
import type { AssertTrue, CheckServerRequestOptions } from '@sentry/core/server';
import {
  classifyResponseStreaming,
  getClientIPAddress,
  isStaticAssetRequest,
  startRequestSession,
} from '@sentry/core/server';
import type { Server, ServeOptions } from 'bun';
import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_REQUEST_METHOD,
  NETWORK_PROTOCOL_NAME,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_DOMAIN,
  URL_FRAGMENT,
  URL_FULL,
  URL_PATH,
  URL_PORT,
  URL_QUERY,
  URL_SCHEME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { monitorStream } from '../utils/streaming';

const INTEGRATION_NAME = 'BunServer' as const;

export type BunServerIntegrationOptions = {
  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   * An explicit value overrides `dataCollection.httpBodies`.
   *
   * If `dataCollection.httpBodies` excludes `'incomingRequest'`, body capture defaults to `'none'`.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: MaxRequestBodySize;

  /**
   * Do not capture the request body for incoming requests where the given callback returns `true`.
   *
   * `url` is the full URL of the request, including the query string. `request` is the incoming
   * {@link Request}. The callback runs before the SDK reads the body.
   */
  ignoreRequestBody?: (url: string, request: Request) => boolean;

  /**
   * Do not capture server spans for incoming requests whose URL path makes the given callback return `true`.
   *
   * `urlPath` is the path of the request, including the query string. `request` is the incoming
   * {@link Request}. Errors thrown by the handler are still captured.
   */
  ignoreIncomingRequests?: (urlPath: string, request: Request) => boolean;

  /**
   * Whether to automatically ignore common static asset requests (favicon.ico, robots.txt, etc.)
   * when creating server spans.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Whether to create spans for incoming requests.
   * Errors are still captured and request data is still attached when this is `false`.
   * Defaults to the client's tracing configuration (`hasSpansEnabled`).
   */
  spans?: boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, before the request handler runs.
   */
  onSpanCreated?: (span: Span, request: Request) => void;

  /**
   * A hook that can be used to mutate the span one last time before it ends.
   * For a streamed response, this runs when the stream finishes.
   * It is not called when the request handler throws.
   */
  onSpanEnd?: (span: Span, request: Request, response: Response) => void;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for
   * incoming requests to track the health and crash-free rate of your releases in Sentry.
   *
   * For a streamed response, the session ends when the stream finishes.
   *
   * @default `true`
   */
  sessions?: boolean;

  /**
   * Number of milliseconds until sessions are flushed as a session aggregate.
   *
   * @default `60000` (60s)
   */
  sessionFlushingDelayMS?: number;
};

// Checks these options against the shared `ServerRequestOptions`. A new
// shared field fails to compile here, until this integration supports
// it or lists it as unsupported.
type _ServerRequestOptionsCheck = AssertTrue<CheckServerRequestOptions<BunServerIntegrationOptions, Request, Response>>;

const _bunServerIntegration = ((options: BunServerIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    maxRequestBodySize: options.maxRequestBodySize,
    ignoreRequestBody: options.ignoreRequestBody,
    ignoreIncomingRequests: options.ignoreIncomingRequests,
    ignoreStaticAssets: options.ignoreStaticAssets ?? true,
    spans: options.spans,
    onSpanCreated: options.onSpanCreated,
    onSpanEnd: options.onSpanEnd,
    sessions: options.sessions ?? true,
    sessionFlushingDelayMS: options.sessionFlushingDelayMS,
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

function captureServeError(error: unknown): void {
  captureException(error, { mechanism: { type: 'auto.http.bun.serve', handled: false } });
}

// A user callback that throws must not fail the request or leave the span open.
function callUserCallback<T>(name: string, callback: () => T, fallback: T): T {
  try {
    return callback();
  } catch (e) {
    debug.error(`Error in the Bun.serve ${name} callback.`, e);
    return fallback;
  }
}

function shouldCreateSpan(
  client: Client | undefined,
  integration: BunServerIntegrationOptions | undefined,
  request: Request,
  urlPath: string,
): boolean {
  if (!(integration?.spans ?? (client ? hasSpansEnabled(client.getOptions()) : false))) {
    return false;
  }
  if (integration?.ignoreStaticAssets && request.method.toUpperCase() === 'GET' && isStaticAssetRequest(urlPath)) {
    return false;
  }
  const ignoreIncomingRequests = integration?.ignoreIncomingRequests;
  return !(
    ignoreIncomingRequests &&
    callUserCallback('ignoreIncomingRequests', () => ignoreIncomingRequests(urlPath, request), false)
  );
}

/**
 * Calls `onDone` when the response is done: at once, or when a streamed body finishes.
 * Returns the response to send.
 */
function onResponseDone<T extends Response | undefined>(response: T, onDone: () => void, onStreamError: () => void): T {
  if (response?.body && !response.body.locked && classifyResponseStreaming(response).isStreaming) {
    const body = monitorStream(response.body, onDone, error => {
      onStreamError();
      captureServeError(error);
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }) as T;
  }
  onDone();
  return response;
}

function wrapRequestHandler<T extends RouteHandler = RouteHandler>(
  target: T,
  thisArg: unknown,
  args: Parameters<T>,
  route?: string,
): Promise<Awaited<ReturnType<T>>> {
  return withIsolationScope(async isolationScope => {
    const request = args[0];
    const upperCaseMethod = request.method.toUpperCase();

    const client = getClient();
    const integration = client?.getIntegrationByName<Integration & BunServerIntegrationOptions>(INTEGRATION_NAME);
    const endSession =
      client && integration?.sessions
        ? startRequestSession(client, {
            requestIsolationScope: isolationScope,
            sessionFlushingDelayMS: integration.sessionFlushingDelayMS,
          })
        : undefined;

    if (upperCaseMethod === 'OPTIONS' || upperCaseMethod === 'HEAD') {
      try {
        return await target.apply(thisArg, args);
      } catch (e) {
        captureServeError(e);
        throw e;
      } finally {
        endSession?.();
      }
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
        attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
        attributes['url.template'] = route;
        routeName = route;
      }
    }

    // Handle wildcard routes
    if (route?.endsWith('/*')) {
      attributes[SENTRY_SEGMENT_NAME_SOURCE] = 'route';
      attributes['url.template'] = route;
      routeName = route;
    }

    const dataCollection = client?.getDataCollectionOptions();

    let socketAddress: { address: string; port: number } | undefined;
    if (dataCollection) {
      const headers = request.headers.toJSON();
      // Bun passes the `Server` as the second argument to both `fetch` and route handlers, except
      // when the handler runs through `server.fetch()`.
      socketAddress = getRequestIP(args[1], request);

      if (dataCollection.userInfo) {
        // `client.address` is the originating client, so a forwarding header wins over the socket, which
        // behind a proxy holds the proxy's address. The socket port is the proxy's too, so `client.port`
        // stays unset then.
        const forwardedAddress = getClientIPAddress(headers);
        if (forwardedAddress) {
          attributes[CLIENT_ADDRESS] = forwardedAddress;
        } else if (socketAddress) {
          attributes[CLIENT_ADDRESS] = socketAddress.address;
          attributes[CLIENT_PORT] = socketAddress.port;
        }
      }

      Object.assign(attributes, httpHeadersToSpanAttributes(headers, dataCollection));
    }

    // describes the OSI application-layer protocol (http), not the scheme (might be https)
    attributes[NETWORK_PROTOCOL_NAME] = 'http';

    isolationScope.setSDKProcessingMetadata({
      normalizedRequest: winterCGRequestToRequestData(request),
      ipAddress: socketAddress?.address,
    });

    if (dataCollection) {
      const effectiveBodySize =
        integration?.maxRequestBodySize ?? (dataCollection.httpBodies.includes('incomingRequest') ? 'medium' : 'none');
      const ignoreRequestBody = integration?.ignoreRequestBody;
      if (
        upperCaseMethod !== 'GET' &&
        effectiveBodySize !== 'none' &&
        // If the filter throws, skip the body so it cannot leak data the filter was meant to hide.
        !(
          ignoreRequestBody &&
          callUserCallback('ignoreRequestBody', () => ignoreRequestBody(request.url, request), true)
        )
      ) {
        await captureBodyFromWinterCGRequest(request, isolationScope, effectiveBodySize);
      }
    }

    const urlPath = parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : '/';
    const createSpan = shouldCreateSpan(client, integration, request, urlPath);

    return continueTrace(
      {
        sentryTrace: request.headers.get('sentry-trace') ?? '',
        baggage: request.headers.get('baggage'),
      },
      async () => {
        if (!createSpan) {
          let response: Response | undefined;
          try {
            response = (await target.apply(thisArg, args)) as Response | undefined;
          } catch (e) {
            captureServeError(e);
            endSession?.();
            throw e;
          }
          if (response?.status) {
            isolationScope.setContext('response', { status_code: response.status });
          }
          return onResponseDone(
            response,
            () => endSession?.(),
            () => undefined,
          );
        }

        return startSpanManual(
          {
            attributes: { ...attributes, [SENTRY_OP]: HTTP_SERVER },
            // With span streaming, span names have to be low cardinality, so we can't fall back to the URL path.
            name:
              attributes[SENTRY_SEGMENT_NAME_SOURCE] === 'route' || !client || !hasSpanStreamingEnabled(client)
                ? `${request.method} ${routeName}`
                : request.method?.toUpperCase() || HTTP_SPAN_NAME_FALLBACK,
          },
          async (span, endSpan) => {
            const { onSpanCreated, onSpanEnd } = integration ?? {};
            if (onSpanCreated) {
              callUserCallback('onSpanCreated', () => onSpanCreated(span, request), undefined);
            }

            let response: Response | undefined;
            try {
              response = (await target.apply(thisArg, args)) as Response | undefined;
            } catch (e) {
              span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
              captureServeError(e);
              endSpan();
              endSession?.();
              throw e;
            }

            if (response?.status) {
              setHttpStatus(span, response.status);

              isolationScope.setContext('response', {
                status_code: response.status,
              });

              if (dataCollection) {
                span.setAttributes(httpHeadersToSpanAttributes(response.headers.toJSON(), dataCollection, 'response'));
              }
            }

            const finalResponse = response;
            return onResponseDone(
              response,
              () => {
                if (onSpanEnd && finalResponse) {
                  callUserCallback('onSpanEnd', () => onSpanEnd(span, request, finalResponse), undefined);
                }
                endSpan();
                endSession?.();
              },
              () => span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' }),
            );
          },
        );
      },
    );
  });
}

function getRequestIP(
  server: Partial<Pick<Server, 'requestIP'>> | undefined,
  request: Request,
): { address: string; port: number } | undefined {
  if (typeof server?.requestIP !== 'function') {
    return undefined;
  }
  try {
    return server.requestIP(request) ?? undefined;
  } catch {
    // Defensive: never let a failed lookup break the user's handler.
    return undefined;
  }
}

function getSpanAttributesFromParsedUrl(
  parsedUrl: ReturnType<typeof parseStringToURLObject>,
  request: Request,
): SpanAttributes {
  const attributes: SpanAttributes = {
    [SENTRY_ORIGIN]: 'auto.http.bun.serve',
    [HTTP_REQUEST_METHOD]: request.method || 'GET',
    [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
  };

  if (parsedUrl) {
    attributes[URL_QUERY] = filterCollectedUrlQuery(getUrlQuery(parsedUrl.search));
    attributes[URL_FRAGMENT] = getUrlFragment(parsedUrl.hash);
    if (parsedUrl.pathname) {
      attributes[URL_PATH] = parsedUrl.pathname;
    }
    if (!isURLObjectRelative(parsedUrl)) {
      attributes[URL_FULL] = filterCollectedUrl(parsedUrl.href);
      if (parsedUrl.port) {
        attributes[URL_PORT] = parsedUrl.port;
      }
      if (parsedUrl.protocol) {
        attributes[URL_SCHEME] = parsedUrl.protocol;
      }
      if (parsedUrl.hostname) {
        attributes[URL_DOMAIN] = parsedUrl.hostname;
      }
    }
  }

  return attributes;
}
