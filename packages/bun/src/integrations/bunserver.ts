import type { Client, Integration, IntegrationFn, MaxRequestBodySize, Span, SpanAttributes } from '@sentry/core';
import { debug, defineIntegration, getClient, withIsolationScope } from '@sentry/core';
import type { AssertTrue, CheckServerRequestOptions, ServerRequestOptions } from '@sentry/core/server';
import { URL_PATH_PARAMETER_KEY_BASE } from '@sentry/conventions/attributes';
import { wrapServerRequestHandler } from '@sentry/server-utils/request-handler';
import type { Server, ServeOptions } from 'bun';

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

// Every shared option is a required key, so a new one fails to compile below until the integration
// passes it on.
type BunServerRequestOptions = {
  [K in keyof Required<ServerRequestOptions<Request, Response>>]: ServerRequestOptions<Request, Response>[K];
};

interface BunServerIntegration extends Integration {
  requestOptions: BunServerRequestOptions;
}

/** The incoming request options of the client's `bunServerIntegration`, if it has one. */
function getBunServerRequestOptions(client: Client): ServerRequestOptions<Request, Response> | undefined {
  return client.getIntegrationByName<BunServerIntegration>(INTEGRATION_NAME)?.requestOptions;
}

const _bunServerIntegration = ((options: BunServerIntegrationOptions = {}): BunServerIntegration => {
  return {
    name: INTEGRATION_NAME,
    requestOptions: {
      maxRequestBodySize: options.maxRequestBodySize,
      ignoreRequestBody: options.ignoreRequestBody,
      ignoreIncomingRequests: options.ignoreIncomingRequests,
      ignoreStaticAssets: options.ignoreStaticAssets ?? true,
      spans: options.spans,
      onSpanCreated: options.onSpanCreated,
      onSpanEnd: options.onSpanEnd,
      sessions: options.sessions ?? true,
      sessionFlushingDelayMS: options.sessionFlushingDelayMS,
    },
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
): Promise<Awaited<ReturnType<T>>> {
  return withIsolationScope(async isolationScope => {
    const request = args[0];
    const runHandler = (): Promise<Response | undefined> =>
      Promise.resolve(target.apply(thisArg, args) as Response | undefined);

    const client = getClient();
    if (!client) {
      debug.warn('Cannot instrument Bun.serve request. No client defined.');
      return runHandler();
    }

    const attributes: SpanAttributes = {};
    for (const [key, value] of Object.entries(request.params ?? {})) {
      attributes[`${URL_PATH_PARAMETER_KEY_BASE}.${key}`] = String(value);
    }

    return wrapServerRequestHandler(
      {
        request,
        client,
        isolationScope,
        options: getBunServerRequestOptions(client),
        origin: 'auto.http.bun.serve',
        mechanism: { type: 'auto.http.bun.serve', handled: false },
        // Bun passes the `Server` as the second argument to both `fetch` and route handlers, except
        // when the handler runs through `server.fetch()`.
        getSocketAddress: () => getRequestIP(args[1], request),
        routeName: route,
        attributes,
      },
      runHandler,
    );
  }) as Promise<Awaited<ReturnType<T>>>;
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
