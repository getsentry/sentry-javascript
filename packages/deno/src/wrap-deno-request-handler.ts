import { CLIENT_ADDRESS, CLIENT_PORT, NETWORK_PROTOCOL_NAME } from '@sentry/conventions/attributes';
import type { Integration, MaxRequestBodySize } from '@sentry/core';
import {
  captureBodyFromWinterCGRequest,
  captureException,
  continueTrace,
  getClient,
  getHttpSpanDetailsFromUrlObject,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  setHttpStatus,
  startSpanManual,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { streamResponse } from './utils/streaming';

export type RequestHandlerWrapperOptions<Addr extends Deno.Addr> = {
  request: Request;
  info: Deno.ServeHandlerInfo<Addr>;
  serveOptions?: Deno.ServeOptions<Addr>;
};

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
      throw new Error('could not get Deno client. Did you run Sentry.init?');
    }
    isolationScope.setClient(client);

    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      try {
        return await handler();
      } catch (e) {
        captureException(e, {
          mechanism: {
            handled: false,
            type: 'auto.http.deno',
            data: { function: 'serve' },
          },
        });
        throw e;
      }
    }

    const urlObject = parseStringToURLObject(request.url);
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(
      urlObject,
      'server',
      'auto.http.deno',
      request,
      undefined,
      client,
    );

    const contentLength = request.headers.get('content-length');
    assignIfSet(attributes, 'http.request.body.size', contentLength && parseInt(contentLength, 10));
    assignIfSet(attributes, 'user_agent.original', request.headers.get('user-agent'));

    const dataCollection = client.getDataCollectionOptions();
    if (dataCollection.userInfo) {
      // `client.address` is the originating client, so a forwarding header wins over the socket, which
      // behind a proxy holds the proxy's address.
      const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const socketAddress = (info?.remoteAddr as Deno.NetAddr)?.hostname ?? (info?.remoteAddr as Deno.UnixAddr)?.path;
      const clientPort = (info?.remoteAddr as Deno.NetAddr)?.port;
      assignIfSet(attributes, CLIENT_ADDRESS, forwardedFor || socketAddress);
      assignIfSet(attributes, CLIENT_PORT, clientPort);
    }

    // describes the OSI application-layer protocol (http), not the scheme (might be https)
    attributes[NETWORK_PROTOCOL_NAME] = 'http';

    Object.assign(attributes, httpHeadersToSpanAttributes(winterCGHeadersToDict(request.headers), dataCollection));
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';
    isolationScope.setSDKProcessingMetadata({
      normalizedRequest: winterCGRequestToRequestData(request),
    });

    const configuredBodySize = client.getIntegrationByName<Integration & { maxRequestBodySize?: MaxRequestBodySize }>(
      'DenoServe',
    )?.maxRequestBodySize;
    const effectiveBodySize =
      configuredBodySize ?? (dataCollection.httpBodies.includes('incomingRequest') ? 'medium' : 'none');
    if (request.method !== 'GET' && effectiveBodySize !== 'none') {
      await captureBodyFromWinterCGRequest(request, isolationScope, effectiveBodySize);
    }

    return continueTrace(
      {
        sentryTrace: request.headers.get('sentry-trace') || '',
        baggage: request.headers.get('baggage'),
      },
      () => {
        return startSpanManual({ name, attributes }, async span => {
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
            captureException(e, {
              mechanism: {
                handled: false,
                type: 'auto.http.deno',
                data: { function: 'serve' },
              },
            });
            throw e;
          }

          return streamResponse(span, res);
        });
      },
    );
  });
};
