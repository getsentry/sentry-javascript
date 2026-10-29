import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  HTTP_REQUEST_BODY_SIZE,
  NETWORK_PROTOCOL_NAME,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Client, Mechanism, Scope, SpanAttributes } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  captureException,
  continueTrace,
  getCurrentScope,
  getHttpSpanDetailsFromUrlObject,
  hasSpansEnabled,
  hasSpanStreamingEnabled,
  httpHeadersToSpanAttributes,
  HTTP_SPAN_NAME_FALLBACK,
  parseStringToURLObject,
  safeCallback,
  setHttpStatus,
  SPAN_STATUS_ERROR,
  startSpanManual,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type { ServerRequestOptions } from '@sentry/core/server';
import {
  _INTERNAL_isServedTunnelRequest as isServedTunnelRequest,
  classifyResponseStreaming,
  getClientIPAddress,
  isStaticAssetRequest,
  startRequestSession,
} from '@sentry/core/server';
import { DEBUG_BUILD } from '../debug-build';
import { monitorStream } from './monitorStream';

export interface ServerRequestHandlerConfig {
  request: Request;
  client: Client;
  /** The isolation scope of this request. */
  isolationScope: Scope;
  /** The options of the runtime's integration for incoming requests. */
  options: ServerRequestOptions<Request, Response> | undefined;
  /** Origin of the span, e.g. `auto.http.deno`. */
  origin: string;
  /** Mechanism of errors that the handler or the response stream throws. Omit to not capture them. */
  mechanism?: Mechanism;
  /** The address and port of the socket, if the runtime knows them. */
  getSocketAddress?: () => { address: string; port?: number } | undefined;
  /** The matched route of the server framework, e.g. `/users/:id`. Sets `http.route` and the span name. */
  routeName?: string;
  /** Span attributes that only the runtime knows, e.g. the route parameters. */
  attributes?: SpanAttributes;
  /** Whether the response streams. Return `undefined` to use the default classification. */
  isStreamingResponse?: (response: Response) => boolean | undefined;
  /**
   * Called once when the request is done: when the response is returned, when a streamed body
   * finishes, or when the handler throws (then without a response).
   */
  onDone?: (response: Response | undefined) => void;
}

/**
 * Wraps a handler of a web `Request`, as used by `Deno.serve`, `Bun.serve` and Cloudflare Workers.
 *
 * It records the request session, attaches the request data and body, continues the incoming
 * trace, creates the `http.server` span, and captures errors that the handler throws. The rules
 * follow core's `node:http` server code:
 *
 * - `OPTIONS` and `HEAD` requests get no span and no body capture.
 * - The static asset filter applies only to `GET`.
 * - The span and the session of a streamed response end when the stream finishes.
 *
 * The handler can return no response, as Bun's `fetch` does after a WebSocket upgrade.
 */
export async function wrapServerRequestHandler<R extends Response | undefined = Response>(
  config: ServerRequestHandlerConfig,
  handler: () => R | Promise<R>,
): Promise<R> {
  const { request, client, isolationScope, options, mechanism } = config;

  // The tunnel answers these before the app, so they get no session, request data, body or span.
  if (isServedTunnelRequest(request)) {
    let response: R | undefined;
    try {
      response = await handler();
      return response;
    } finally {
      config.onDone?.(response);
    }
  }

  const method = request.method.toUpperCase();
  const captureError = (error: unknown): void => {
    if (mechanism) {
      captureException(error, { mechanism });
    }
  };

  const endSession = options?.sessions
    ? startRequestSession(client, {
        requestIsolationScope: isolationScope,
        sessionFlushingDelayMS: options.sessionFlushingDelayMS,
      })
    : undefined;
  const finish = (response: Response | undefined): void => {
    endSession?.();
    config.onDone?.(response);
  };
  const isStreamingResponse = (response: Response): boolean => {
    const classification = config.isStreamingResponse?.(response);
    return typeof classification === 'boolean' ? classification : classifyResponseStreaming(response).isStreaming;
  };

  const socketAddress = config.getSocketAddress?.();
  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(request),
    ipAddress: socketAddress?.address,
  });

  if (method === 'OPTIONS' || method === 'HEAD') {
    let response: R | undefined;
    try {
      response = await handler();
      return response;
    } catch (e) {
      captureError(e);
      throw e;
    } finally {
      finish(response);
    }
  }

  const dataCollection = client.getDataCollectionOptions();
  const effectiveBodySize =
    options?.maxRequestBodySize ?? (dataCollection.httpBodies.includes('incomingRequest') ? 'medium' : 'none');
  const ignoreRequestBody = options?.ignoreRequestBody;
  if (
    method !== 'GET' &&
    effectiveBodySize !== 'none' &&
    // If the filter throws, skip the body so it cannot leak data the filter was meant to hide.
    !(
      ignoreRequestBody &&
      safeCallback(
        DEBUG_BUILD ? 'Error in `ignoreRequestBody`, skipping the body:' : '',
        () => ignoreRequestBody(request.url, request),
        () => true,
      )
    )
  ) {
    await captureBodyFromWinterCGRequest(request, isolationScope, effectiveBodySize);
  }

  const urlObject = parseStringToURLObject(request.url);
  const urlPath = urlObject ? `${urlObject.pathname}${urlObject.search}` : '/';
  const createSpan = shouldCreateSpan(client, options, request, urlPath);

  return continueTrace(
    {
      sentryTrace: request.headers.get('sentry-trace') || '',
      baggage: request.headers.get('baggage'),
    },
    async () => {
      if (!createSpan) {
        let response: R;
        try {
          response = await handler();
        } catch (e) {
          captureError(e);
          finish(undefined);
          throw e;
        }
        if (response) {
          isolationScope.setContext('response', { status_code: response.status });
        }
        const inRequestScope = bindToRequestScope(isolationScope);
        return onResponseDone(
          response,
          !!response && isStreamingResponse(response),
          inRequestScope(() => finish(response)),
          inRequestScope(captureError),
        );
      }

      const [rawName, attributes] = getHttpSpanDetailsFromUrlObject(
        urlObject,
        'server',
        config.origin,
        request,
        config.routeName,
        client,
      );
      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
      // A `route` source means the name already is (e.g. the `/` path), so it is kept as-is.
      const name =
        attributes[SENTRY_SEGMENT_NAME_SOURCE] === 'route' || !hasSpanStreamingEnabled(client)
          ? rawName
          : method || HTTP_SPAN_NAME_FALLBACK;

      const contentLength = request.headers.get('content-length');
      if (contentLength) {
        attributes[HTTP_REQUEST_BODY_SIZE] = parseInt(contentLength, 10);
      }
      const userAgent = request.headers.get('user-agent');
      if (userAgent) {
        attributes[USER_AGENT_ORIGINAL] = userAgent;
      }

      const headers = winterCGHeadersToDict(request.headers);
      if (dataCollection.userInfo) {
        // `client.address` is the originating client, so a forwarding header wins over the socket, which
        // behind a proxy holds the proxy's address. The socket port is the proxy's too, so `client.port`
        // stays unset then.
        const forwardedAddress = getClientIPAddress(headers);
        if (forwardedAddress) {
          attributes[CLIENT_ADDRESS] = forwardedAddress;
        } else if (socketAddress) {
          attributes[CLIENT_ADDRESS] = socketAddress.address;
          if (socketAddress.port !== undefined) {
            attributes[CLIENT_PORT] = socketAddress.port;
          }
        }
      }

      // describes the OSI application-layer protocol (http), not the scheme (might be https)
      attributes[NETWORK_PROTOCOL_NAME] = 'http';
      Object.assign(attributes, httpHeadersToSpanAttributes(headers, dataCollection));
      Object.assign(attributes, config.attributes);
      attributes[SENTRY_OP] = HTTP_SERVER;

      return startSpanManual({ name, attributes }, async span => {
        const { onSpanCreated, onSpanEnd } = options ?? {};
        if (onSpanCreated) {
          safeCallback(
            DEBUG_BUILD ? 'Error in `onSpanCreated`:' : '',
            () => onSpanCreated(span, request),
            () => undefined,
          );
        }

        let response: R;
        try {
          response = await handler();
        } catch (e) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          span.end();
          captureError(e);
          finish(undefined);
          throw e;
        }

        if (response) {
          setHttpStatus(span, response.status);
          isolationScope.setContext('response', { status_code: response.status });
          span.setAttributes(
            httpHeadersToSpanAttributes(responseHeadersToDict(response.headers), dataCollection, 'response'),
          );
        }

        const inRequestScope = bindToRequestScope(isolationScope);
        return onResponseDone(
          response,
          !!response && isStreamingResponse(response),
          inRequestScope(() => {
            if (onSpanEnd && response) {
              safeCallback(
                DEBUG_BUILD ? 'Error in `onSpanEnd`:' : '',
                () => onSpanEnd(span, request, response),
                () => undefined,
              );
            }
            span.end();
            finish(response);
          }),
          inRequestScope((error: unknown) => {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureError(error);
          }),
        );
      });
    },
  );
}

/**
 * Returns a function that binds a callback to the request's isolation scope and the current scope.
 *
 * A streamed body finishes after the handler returns. Without `AsyncLocalStorage` (Cloudflare
 * Workers without `nodejs_compat`), its callbacks then run outside the request's scopes, where
 * `getClient()` finds no client: the segment span would be sent as a transaction, and a captured
 * error would not update the request session.
 */
function bindToRequestScope(
  isolationScope: Scope,
): <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void {
  const scope = getCurrentScope();
  return fn =>
    (...args) =>
      withIsolationScope(isolationScope, () => withScope(scope, () => fn(...args)));
}

function shouldCreateSpan(
  client: Client,
  options: ServerRequestOptions<Request, Response> | undefined,
  request: Request,
  urlPath: string,
): boolean {
  if (!(options?.spans ?? hasSpansEnabled(client.getOptions()))) {
    return false;
  }
  if (options?.ignoreStaticAssets && request.method.toUpperCase() === 'GET' && isStaticAssetRequest(urlPath)) {
    return false;
  }
  const ignoreIncomingRequests = options?.ignoreIncomingRequests;
  return !(
    ignoreIncomingRequests &&
    safeCallback(
      DEBUG_BUILD ? 'Error in `ignoreIncomingRequests`, creating the span:' : '',
      () => ignoreIncomingRequests(urlPath, request),
      () => false,
    )
  );
}

/**
 * Calls `onDone` when the response is done: at once, or when a streamed body finishes.
 * Returns the response to send.
 */
function onResponseDone<R extends Response | undefined>(
  response: R,
  isStreaming: boolean,
  onDone: () => void,
  onStreamError: (error: unknown) => void,
): R {
  if (isStreaming && response?.body && !response.body.locked) {
    try {
      // Passing the original response as the init keeps its status, status text and headers, and
      // on Cloudflare also `encodeBody: 'manual'`, so workerd does not compress a compressed body again.
      return new Response(monitorStream(response.body, onDone, onStreamError), response) as R;
    } catch {
      // Workers with a compatibility date before 2022-11-30 and without the
      // `streams_enable_constructors` flag cannot construct a `ReadableStream`, so end at once.
    }
  }
  onDone();
  return response;
}

// `Headers.forEach` lists each `Set-Cookie` header on its own, so a plain dict keeps only the last one.
function responseHeadersToDict(headers: Headers): Record<string, string | string[]> {
  const dict: Record<string, string | string[]> = winterCGHeadersToDict(headers);
  const setCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (setCookie.length) {
    dict['set-cookie'] = setCookie;
  }
  return dict;
}
