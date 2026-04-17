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
import { generateSpanId, generateTraceId } from '../../utils/propagationContext';
import { continueTrace } from '../../tracing/trace';
import { safeMathRandom } from '../../utils/randomSafeContext';

const INTEGRATION_NAME = 'Http.Server';

export type HttpServerSubscriptions = Record<ServerSubscriptionName, ChannelListener>;

// Tracks the last Sentry-created emit wrapper for each server so we can detect
// when user code has replaced server.emit (e.g. with a proxy of the original)
// and re-wrap it to restore Sentry's instrumentation.
const lastSentryEmitMap = new WeakMap<HttpServer, HttpServer['emit']>();

const kRequestMark = Symbol.for('sentry_http_server_instrumented');
type MarkedRequest = HttpIncomingMessage & {
  [kRequestMark]?: boolean;
};

/** return true if it is NOT already marked */
function markRequest(request: MarkedRequest): boolean {
  return !request[kRequestMark] && (request[kRequestMark] = true);
}

export function instrumentServer(options: HttpInstrumentationOptions, server: HttpServer): void {
  // Use a proxy and a WeakSet of server objects here, rather than a
  // wrappedFunction, because NestJS has been observed to "fork" emit
  // methods, including copying properties, leading to false positives.
  // Furthermore, we mark the Request object so that if two copies of this
  // instrumentation both are run on forked emit() methods for the same
  // request, we still only ever create a single root span. Previously,
  // this was done with a flag on the OTEL context, but in this non-OTEL
  // version, we mark the Request itself with a non-enumerable prop instead.

  const currentEmit = server.emit;
  const instrumentedEmit = lastSentryEmitMap.get(server);

  // Skip re-wrapping only if already instrumented AND server.emit still points
  // to our wrapper. If user code replaced server.emit (e.g. with a proxy of the
  // original pre-Sentry emit), re-wrap so Sentry's instrumentation is restored.
  if (currentEmit === instrumentedEmit) {
    return;
  }

  const newEmit = new Proxy(currentEmit, {
    apply(target, thisArg, args: unknown[]) {
      const [event, ...data] = args;
      if (event !== 'request') {
        return target.apply(thisArg, args);
      }

      const client = getClient();
      const [request, response] = data as [HttpIncomingMessage, HttpServerResponse];

      if (!client || !markRequest(request)) {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INTEGRATION_NAME, 'Handling incoming request');
      const isolationScope = getIsolationScope().clone();
      isolationScope.setClient(client);

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
        const sentryTraceValue = Array.isArray(sentryTrace) ? sentryTrace[0] : sentryTrace;
        return continueTrace(
          {
            sentryTrace: sentryTraceValue,
            baggage: Array.isArray(baggage) ? baggage[0] : baggage,
          },
          () => {
            const propagationContext = getCurrentScope().getPropagationContext();
            // Set propagationSpanId after continueTrace because it calls
            // withScope + setPropagationContext internally, which would
            // overwrite any previously set value.
            propagationContext.propagationSpanId = generateSpanId();
            // In OTel mode, continueTrace does not generate a new traceId
            // when there is no incoming sentry-trace header. We generate one
            // explicitly here so each request gets a unique trace ID even when
            // tracing is disabled.
            if (!sentryTraceValue) {
              propagationContext.traceId = generateTraceId();
              propagationContext.sampleRand = safeMathRandom();
            }

            response.once('close', () => {
              isolationScope.setContext('response', {
                status_code: response.statusCode,
              });
            });

            const wrap = options.wrapServerEmitRequest;
            if (wrap) {
              wrap(request, response, normalizedRequest, () => {
                target.apply(thisArg, args);
              });
            } else {
              target.apply(thisArg, args);
            }
            return thisArg;
          },
        );
      });
    },
  });

  lastSentryEmitMap.set(server, newEmit);
  server.emit = newEmit;
}

export function getHttpServerSubscriptions(options: HttpInstrumentationOptions): HttpServerSubscriptions {
  const onHttpServerRequest: ChannelListener = (data: unknown): void => {
    const { server } = data as { server: HttpServer };
    instrumentServer(options, server);
  };

  return { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest };
}
