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
import type { Client, Mechanism, Scope, Span } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  captureException,
  continueTrace,
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
} from '@sentry/core';
import type { ServerRequestOptions } from '@sentry/core/server';
import {
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
  /** Mechanism of errors that the handler or the response stream throws. */
  mechanism: Mechanism;
  /** The address and port of the socket, if the runtime knows them. */
  getSocketAddress?: () => { address: string; port?: number } | undefined;
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
 */
export async function wrapServerRequestHandler(
  config: ServerRequestHandlerConfig,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  const { request, client, isolationScope, options, mechanism } = config;
  const method = request.method.toUpperCase();

  const endSession = options?.sessions
    ? startRequestSession(client, {
        requestIsolationScope: isolationScope,
        sessionFlushingDelayMS: options.sessionFlushingDelayMS,
      })
    : undefined;

  const socketAddress = config.getSocketAddress?.();
  isolationScope.setSDKProcessingMetadata({
    normalizedRequest: winterCGRequestToRequestData(request),
    ipAddress: socketAddress?.address,
  });

  if (method === 'OPTIONS' || method === 'HEAD') {
    try {
      return await handler();
    } catch (e) {
      captureException(e, { mechanism });
      throw e;
    } finally {
      endSession?.();
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
        let response: Response;
        try {
          response = await handler();
        } catch (e) {
          captureException(e, { mechanism });
          endSession?.();
          throw e;
        }
        isolationScope.setContext('response', { status_code: response.status });
        return onResponseDone(response, mechanism, () => endSession?.());
      }

      const [rawName, attributes] = getHttpSpanDetailsFromUrlObject(
        urlObject,
        'server',
        config.origin,
        request,
        undefined,
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

        let response: Response;
        try {
          response = await handler();
        } catch (e) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          span.end();
          captureException(e, { mechanism });
          endSession?.();
          throw e;
        }

        setHttpStatus(span, response.status);
        isolationScope.setContext('response', { status_code: response.status });
        span.setAttributes(
          httpHeadersToSpanAttributes(winterCGHeadersToDict(response.headers), dataCollection, 'response'),
        );

        return onResponseDone(
          response,
          mechanism,
          () => {
            if (onSpanEnd) {
              safeCallback(
                DEBUG_BUILD ? 'Error in `onSpanEnd`:' : '',
                () => onSpanEnd(span, request, response),
                () => undefined,
              );
            }
            span.end();
            endSession?.();
          },
          span,
        );
      });
    },
  );
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
function onResponseDone(response: Response, mechanism: Mechanism, onDone: () => void, span?: Span): Response {
  if (response.body && !response.body.locked && classifyResponseStreaming(response).isStreaming) {
    const body = monitorStream(response.body, onDone, error => {
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      captureException(error, { mechanism });
    });
    // Passing the original response as the init keeps its status, status text and headers.
    return new Response(body, response);
  }
  onDone();
  return response;
}
