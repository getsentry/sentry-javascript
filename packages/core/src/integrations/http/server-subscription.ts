/**
 * Provide the `http.server.request.start` subscription function that we use
 * to instrument incoming HTTP requests that use the `node:http` module.
 *
 * On Node.js v18.7 and up, we can just assign the diagnostics channel
 * listener, and that's enough. But for older node versions, or other SSJS
 * platforms, we have to explicitly fire the provided method an a patched
 * Server.emit method.
 *
 * This decision is made in the relevant Node/Bun/Deno SDKs; core just
 * provides them with the methods to use.
 */

import type { ChannelListener } from 'diagnostics_channel';
import type { ServerSubscriptionName } from './constants';
import { HTTP_ON_SERVER_REQUEST } from './constants';
import type { HttpIncomingMessage, HttpInstrumentationOptions, HttpServer, HttpServerResponse } from './types';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { getClient, getCurrentScope, getIsolationScope, withIsolationScope } from '../../currentScopes';
import { httpRequestToRequestData } from '../../utils/request';
import { patchRequestToCaptureBody } from './patch-request-to-capture-body';
import { stripUrlQueryAndFragment } from '../../utils/url';
import { recordRequestSession } from './record-request-session';
import { generateSpanId } from '../../utils/propagationContext';
import { continueTrace } from '../../tracing/trace';
import { markFunctionWrapped, getOriginalFunction } from '../../utils/object';

const INTEGRATION_NAME = 'Http.Server';

export type HttpServerSubscriptions = Record<ServerSubscriptionName, ChannelListener>;

export function instrumentServer(options: HttpInstrumentationOptions, server: HttpServer): void {
  const originalEmit = server.emit;
  // guard against double-wrapping, even if we have multiple copies of
  // this instrumentation running in the same environment.
  if (getOriginalFunction(originalEmit)) {
    return;
  }

  const newEmit = new Proxy(originalEmit, {
    apply(target, thisArg, args: unknown[]) {
      const [event, ...data] = args;
      if (event !== 'request') {
        return target.apply(thisArg, args);
      }

      const client = getClient();

      if (!client) {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Handling incoming request');
      const isolationScope = getIsolationScope().clone();

      const [request, response] = data as [HttpIncomingMessage, HttpServerResponse];

      const ipAddress = request.socket?.remoteAddress;
      const url = request.url || '/';
      const normalizedRequest = httpRequestToRequestData(request);
      const {
        maxRequestBodySize = 'medium',
        ignoreRequestBody,
        sessions = true,
        sessionFlushingDelayMS = 60_000,
      } = options;

      if (maxRequestBodySize !== 'none' && !ignoreRequestBody?.(url, request)) {
        patchRequestToCaptureBody(request, isolationScope, maxRequestBodySize, INTEGRATION_NAME);
      }

      // Update the isolation scope, isolate this request
      isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress });

      // attempt to update the scope's `transactionName` based on the request URL
      // Ideally, framework instrumentations coming after the HttpInstrumentation
      // update the transactionName once we get a parameterized route.
      const httpMethod = (request.method || 'GET').toUpperCase();
      const httpTargetWithoutQueryFragment = stripUrlQueryAndFragment(url);

      const bestEffortTransactionName = `${httpMethod} ${httpTargetWithoutQueryFragment}`;

      isolationScope.setTransactionName(bestEffortTransactionName);

      // light does not do this
      if (sessions) {
        recordRequestSession(client, {
          requestIsolationScope: isolationScope,
          response,
          sessionFlushingDelayMS: sessionFlushingDelayMS ?? 60_000,
        });
      }

      return withIsolationScope(isolationScope, () => {
        const sentryTrace = normalizedRequest.headers?.['sentry-trace'];
        const baggage = normalizedRequest.headers?.['baggage'];

        return continueTrace(
          {
            sentryTrace: Array.isArray(sentryTrace) ? sentryTrace[0] : sentryTrace,
            baggage: Array.isArray(baggage) ? baggage[0] : baggage,
          },
          () => {
            // Set propagationSpanId after continueTrace because it calls withScope +
            // setPropagationContext internally, which would overwrite any previously set value.
            getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();

            const wrap = options.wrapServerEmitRequest;
            if (wrap) {
              wrap(request, response, normalizedRequest, () => {
                target.apply(this, args);
              });
            } else {
              target.apply(this, args);
            }
            return this;
          },
        );
      });
    },
  });

  markFunctionWrapped(newEmit, originalEmit);
  server.emit = newEmit;
}

export function getHttpServerSubscriptions(options: HttpInstrumentationOptions): HttpServerSubscriptions {
  const onHttpServerRequest: ChannelListener = (data: unknown): void => {
    const { server } = data as { server: HttpServer };
    instrumentServer(options, server);
  };

  // the callback is assigned by the httpServerSpansIntegration When
  // we wmit the 'httpServerRequest' event. But! That *could* just be
  // passed in as an option on the HttpInstrumentationOptions, and
  // called conditionally that way, as it's all synchronous

  //         // this is the bit that is the thing replaced by the light bits
  //         // needs to be a callback passed in or something, because this
  //         // much in here must remain otel-free and strictly sentry only
  //         const ctx = propagation
  //           .extract(context.active(), normalizedRequest.headers)
  //           .setValue(HTTP_SERVER_INSTRUMENTED_KEY, true);
  //
  //         return context.with(ctx, () => {
  //           // This is used (optionally) by the httpServerSpansIntegration to attach _startSpanCallback to the request object
  //           client.emit('httpServerRequest', request, response, normalizedRequest);
  //
  //           const callback = (request as RequestWithOptionalStartSpanCallback)._startSpanCallback?.deref();
  //           if (callback) {
  //             return callback(() => target.apply(thisArg, args));
  //           }
  //           return target.apply(thisArg, args);
  //         });
  //       });
  //   };

  return { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest };
}
