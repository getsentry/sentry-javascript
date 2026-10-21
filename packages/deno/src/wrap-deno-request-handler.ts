import {
  CLIENT_ADDRESS,
  CLIENT_PORT,
  NETWORK_PROTOCOL_NAME,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Client, Integration } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  captureException,
  continueTrace,
  debug,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  hasSpansEnabled,
  hasSpanStreamingEnabled,
  httpHeadersToSpanAttributes,
  HTTP_SPAN_NAME_FALLBACK,
  parseStringToURLObject,
  setHttpStatus,
  startSpanManual,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { getClientIPAddress, isStaticAssetRequest, startRequestSession } from '@sentry/core/server';
import type { DenoServeIntegrationOptions } from './integrations/deno-serve';
import { streamResponse } from './utils/streaming';

export type RequestHandlerWrapperOptions<Addr extends Deno.Addr> = {
  request: Request;
  info: Deno.ServeHandlerInfo<Addr>;
  serveOptions?: Deno.ServeOptions<Addr>;
};

function captureServeError(e: unknown): void {
  captureException(e, {
    mechanism: {
      handled: false,
      type: 'auto.http.deno',
      data: { function: 'serve' },
    },
  });
}

// A user callback that throws must not fail the request or leave the span open.
function callUserCallback<T>(name: string, callback: () => T, fallback: T): T {
  try {
    return callback();
  } catch (e) {
    debug.error(`Error in the Deno.serve ${name} callback.`, e);
    return fallback;
  }
}

function shouldCreateSpan(
  client: Client,
  integration: DenoServeIntegrationOptions | undefined,
  request: Request,
  urlPath: string,
): boolean {
  if (!(integration?.spans ?? hasSpansEnabled(client.getOptions()))) {
    return false;
  }
  if (integration?.ignoreStaticAssets && request.method === 'GET' && isStaticAssetRequest(urlPath)) {
    return false;
  }
  const ignoreIncomingRequests = integration?.ignoreIncomingRequests;
  return !(
    ignoreIncomingRequests &&
    callUserCallback('ignoreIncomingRequests', () => ignoreIncomingRequests(urlPath, request), false)
  );
}

const assignIfSet = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | undefined | null,
): void => {
  if (value !== undefined && value !== null) obj[key] = value;
};

export const wrapDenoRequestHandler = <Addr extends Deno.Addr = Deno.Addr>(
  wrapperOptions: RequestHandlerWrapperOptions<Addr>,
  handler: () => Promise<Response> | Response,
): Response | Promise<Response> => {
  return withIsolationScope(async isolationScope => {
    const { request, info } = wrapperOptions;

    const client = getClient();
    if (!client) {
      // `denoServeIntegration` patches `Deno.serve` from `Client.init()`, which a
      // directly-constructed client also runs — that path never calls
      // `setCurrentClient`, so the patch can be live with no client bound. Keep
      // requests flowing to the user's handler, uninstrumented.
      debug.warn('Cannot instrument Deno.serve request. No client defined.');
      return handler();
    }
    isolationScope.setClient(client);

    const integration = client.getIntegrationByName<Integration & DenoServeIntegrationOptions>('DenoServe');
    const endSession = integration?.sessions
      ? startRequestSession(client, {
          requestIsolationScope: isolationScope,
          sessionFlushingDelayMS: integration.sessionFlushingDelayMS,
        })
      : undefined;

    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      try {
        return await handler();
      } catch (e) {
        captureServeError(e);
        throw e;
      } finally {
        endSession?.();
      }
    }

    const urlObject = parseStringToURLObject(request.url);
    const [rawName, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'auto.http.deno',
      request,
      undefined,
      client,
    );
    // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
    // A `route` source means the name already is (e.g. the `/` path), so it is kept as-is.
    const name =
      attributes[SENTRY_SEGMENT_NAME_SOURCE] === 'route' || !hasSpanStreamingEnabled(client)
        ? rawName
        : request.method?.toUpperCase() || HTTP_SPAN_NAME_FALLBACK;

    const contentLength = request.headers.get('content-length');
    assignIfSet(attributes, 'http.request.body.size', contentLength && parseInt(contentLength, 10));
    assignIfSet(attributes, 'user_agent.original', request.headers.get('user-agent'));

    const headers = winterCGHeadersToDict(request.headers);
    const socketIp = (info?.remoteAddr as Deno.NetAddr)?.hostname;
    const dataCollection = client.getDataCollectionOptions();
    if (dataCollection.userInfo) {
      // `client.address` is the originating client, so a forwarding header wins over the socket, which
      // behind a proxy holds the proxy's address. The socket port is the proxy's too, so `client.port`
      // stays unset then.
      const forwardedAddress = getClientIPAddress(headers);
      assignIfSet(
        attributes,
        CLIENT_ADDRESS,
        forwardedAddress || socketIp || (info?.remoteAddr as Deno.UnixAddr)?.path,
      );
      if (!forwardedAddress) {
        assignIfSet(attributes, CLIENT_PORT, (info?.remoteAddr as Deno.NetAddr)?.port);
      }
    }

    // describes the OSI application-layer protocol (http), not the scheme (might be https)
    attributes[NETWORK_PROTOCOL_NAME] = 'http';

    Object.assign(attributes, httpHeadersToSpanAttributes(headers, dataCollection));
    attributes[SENTRY_OP] = HTTP_SERVER;
    isolationScope.setSDKProcessingMetadata({
      normalizedRequest: winterCGRequestToRequestData(request),
      ipAddress: socketIp,
    });

    const effectiveBodySize =
      integration?.maxRequestBodySize ?? (dataCollection.httpBodies.includes('incomingRequest') ? 'medium' : 'none');
    const ignoreRequestBody = integration?.ignoreRequestBody;
    if (
      request.method !== 'GET' &&
      effectiveBodySize !== 'none' &&
      // If the filter throws, skip the body so it cannot leak data the filter was meant to hide.
      !(ignoreRequestBody && callUserCallback('ignoreRequestBody', () => ignoreRequestBody(request.url, request), true))
    ) {
      await captureBodyFromWinterCGRequest(request, isolationScope, effectiveBodySize);
    }

    const urlPath = urlObject ? `${urlObject.pathname}${urlObject.search}` : '/';
    const createSpan = shouldCreateSpan(client, integration, request, urlPath);

    return continueTrace(
      {
        sentryTrace: request.headers.get('sentry-trace') || '',
        baggage: request.headers.get('baggage'),
      },
      async () => {
        if (!createSpan) {
          let res: Response;
          try {
            res = await handler();
            isolationScope.setContext('response', {
              status_code: res.status,
            });
          } catch (e) {
            captureServeError(e);
            endSession?.();
            throw e;
          }
          return endSession ? streamResponse(undefined, res, endSession) : res;
        }

        return startSpanManual({ name, attributes }, async span => {
          const { onSpanCreated, onSpanEnd } = integration ?? {};
          if (onSpanCreated) {
            callUserCallback('onSpanCreated', () => onSpanCreated(span, request), undefined);
          }
          let res: Response;

          try {
            res = await handler();
            setHttpStatus(span, res.status);
            isolationScope.setContext('response', {
              status_code: res.status,
            });
            span.setAttributes(
              httpHeadersToSpanAttributes(Object.fromEntries(res.headers), dataCollection, 'response'),
            );
          } catch (e) {
            span.end();
            captureServeError(e);
            endSession?.();
            throw e;
          }

          return streamResponse(span, res, () => {
            if (onSpanEnd) {
              callUserCallback('onSpanEnd', () => onSpanEnd(span, request, res), undefined);
            }
            endSession?.();
          });
        });
      },
    );
  });
};
