import { context, propagation } from '@opentelemetry/api';
import type { AggregationCounts, Client, Scope } from '@sentry/core';
import {
  addNonEnumerableProperty,
  debug,
  generateSpanId,
  getClient,
  getCurrentScope,
  getIsolationScope,
  httpHeadersToSpanAttributes,
  httpRequestToRequestData,
  stripUrlQueryAndFragment,
  withIsolationScope,
} from '@sentry/core';
import type EventEmitter from 'events';
import type { IncomingMessage, OutgoingMessage, Server } from 'http';
import { DEBUG_BUILD } from '../../debug-build';
import { INSTRUMENTATION_NAME, MAX_BODY_BYTE_LENGTH } from './constants';

const clientToRequestSessionAggregatesMap = new Map<
  Client,
  { [timestampRoundedToSeconds: string]: { exited: number; crashed: number; errored: number } }
>();

/**
 * Instrument a server to capture incoming requests.
 *
 */
export function instrumentServer(
  server: Server,
  {
    ignoreIncomingRequestBody,
    maxIncomingRequestBodySize = 'medium',
    trackIncomingRequestsAsSessions = true,
    sessionFlushingDelayMS,
  }: {
    ignoreIncomingRequestBody?: (url: string, request: IncomingMessage) => boolean;
    maxIncomingRequestBodySize?: 'small' | 'medium' | 'always' | 'none';
    trackIncomingRequestsAsSessions?: boolean;
    sessionFlushingDelayMS: number;
  },
): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalEmit = server.emit;

  // This means it was already patched, do nothing
  if ((originalEmit as { __sentry_patched__?: boolean }).__sentry_patched__) {
    return;
  }

  const newEmit = new Proxy(originalEmit, {
    apply(target, thisArg, args: [event: string, ...args: unknown[]]) {
      // Only traces request events
      if (args[0] !== 'request') {
        return target.apply(thisArg, args);
      }

      DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Handling incoming request');

      const isolationScope = getIsolationScope().clone();
      const request = args[1] as IncomingMessage;
      const response = args[2] as OutgoingMessage;

      const normalizedRequest = httpRequestToRequestData(request);

      // request.ip is non-standard but some frameworks set this
      const ipAddress = (request as { ip?: string }).ip || request.socket?.remoteAddress;

      const url = request.url || '/';
      if (!ignoreIncomingRequestBody?.(url, request) && maxIncomingRequestBodySize !== 'none') {
        patchRequestToCaptureBody(request, isolationScope, maxIncomingRequestBodySize);
      }

      // Extract HTTP request headers as span attributes
      const client = getClient();
      const sendDefaultPii = client?.getOptions().sendDefaultPii ?? false;
      const httpHeaderAttributes: Record<string, string> = {
        // fixme: adding the attributes here will add them to spans in node-core OTel setups (e.g. E2E test node-core-express-otel-v1)
        // However, adding this here will also add the span attributes to http.client spans in koa
        ...httpHeadersToSpanAttributes(normalizedRequest.headers || {}, sendDefaultPii),
      };

      // Update the isolation scope, isolate this request
      isolationScope.setSDKProcessingMetadata({ normalizedRequest, ipAddress, httpHeaderAttributes });

      // attempt to update the scope's `transactionName` based on the request URL
      // Ideally, framework instrumentations coming after the HttpInstrumentation
      // update the transactionName once we get a parameterized route.
      const httpMethod = (request.method || 'GET').toUpperCase();
      const httpTarget = stripUrlQueryAndFragment(url);

      const bestEffortTransactionName = `${httpMethod} ${httpTarget}`;

      isolationScope.setTransactionName(bestEffortTransactionName);

      if (trackIncomingRequestsAsSessions !== false) {
        recordRequestSession({
          requestIsolationScope: isolationScope,
          response,
          sessionFlushingDelayMS: sessionFlushingDelayMS ?? 60_000,
        });
      }

      return withIsolationScope(isolationScope, () => {
        // Set a new propagationSpanId for this request
        // We rely on the fact that `withIsolationScope()` will implicitly also fork the current scope
        // This way we can save an "unnecessary" `withScope()` invocation
        getCurrentScope().getPropagationContext().propagationSpanId = generateSpanId();

        const ctx = propagation.extract(context.active(), normalizedRequest.headers);
        return context.with(ctx, () => {
          return target.apply(thisArg, args);
        });
      });
    },
  });

  addNonEnumerableProperty(newEmit, '__sentry_patched__', true);

  server.emit = newEmit;
}

/**
 * Starts a session and tracks it in the context of a given isolation scope.
 * When the passed response is finished, the session is put into a task and is
 * aggregated with other sessions that may happen in a certain time window
 * (sessionFlushingDelayMs).
 *
 * The sessions are always aggregated by the client that is on the current scope
 * at the time of ending the response (if there is one).
 */
// Exported for unit tests
export function recordRequestSession({
  requestIsolationScope,
  response,
  sessionFlushingDelayMS,
}: {
  requestIsolationScope: Scope;
  response: EventEmitter;
  sessionFlushingDelayMS?: number;
}): void {
  requestIsolationScope.setSDKProcessingMetadata({
    requestSession: { status: 'ok' },
  });
  response.once('close', () => {
    // We need to grab the client off the current scope instead of the isolation scope because the isolation scope doesn't hold any client out of the box.
    const client = getClient();
    const requestSession = requestIsolationScope.getScopeData().sdkProcessingMetadata.requestSession;

    if (client && requestSession) {
      DEBUG_BUILD && debug.log(`Recorded request session with status: ${requestSession.status}`);

      const roundedDate = new Date();
      roundedDate.setSeconds(0, 0);
      const dateBucketKey = roundedDate.toISOString();

      const existingClientAggregate = clientToRequestSessionAggregatesMap.get(client);
      const bucket = existingClientAggregate?.[dateBucketKey] || { exited: 0, crashed: 0, errored: 0 };
      bucket[({ ok: 'exited', crashed: 'crashed', errored: 'errored' } as const)[requestSession.status]]++;

      if (existingClientAggregate) {
        existingClientAggregate[dateBucketKey] = bucket;
      } else {
        DEBUG_BUILD && debug.log('Opened new request session aggregate.');
        const newClientAggregate = { [dateBucketKey]: bucket };
        clientToRequestSessionAggregatesMap.set(client, newClientAggregate);

        const flushPendingClientAggregates = (): void => {
          clearTimeout(timeout);
          unregisterClientFlushHook();
          clientToRequestSessionAggregatesMap.delete(client);

          const aggregatePayload: AggregationCounts[] = Object.entries(newClientAggregate).map(
            ([timestamp, value]) => ({
              started: timestamp,
              exited: value.exited,
              errored: value.errored,
              crashed: value.crashed,
            }),
          );
          client.sendSession({ aggregates: aggregatePayload });
        };

        const unregisterClientFlushHook = client.on('flush', () => {
          DEBUG_BUILD && debug.log('Sending request session aggregate due to client flush');
          flushPendingClientAggregates();
        });
        const timeout = setTimeout(() => {
          DEBUG_BUILD && debug.log('Sending request session aggregate due to flushing schedule');
          flushPendingClientAggregates();
        }, sessionFlushingDelayMS).unref();
      }
    }
  });
}

/**
 * This method patches the request object to capture the body.
 * Instead of actually consuming the streamed body ourselves, which has potential side effects,
 * we monkey patch `req.on('data')` to intercept the body chunks.
 * This way, we only read the body if the user also consumes the body, ensuring we do not change any behavior in unexpected ways.
 */
function patchRequestToCaptureBody(
  req: IncomingMessage,
  isolationScope: Scope,
  maxIncomingRequestBodySize: 'small' | 'medium' | 'always',
): void {
  let bodyByteLength = 0;
  const chunks: Buffer[] = [];

  DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Patching request.on');

  /**
   * We need to keep track of the original callbacks, in order to be able to remove listeners again.
   * Since `off` depends on having the exact same function reference passed in, we need to be able to map
   * original listeners to our wrapped ones.
   */
  const callbackMap = new WeakMap();

  const maxBodySize =
    maxIncomingRequestBodySize === 'small'
      ? 1_000
      : maxIncomingRequestBodySize === 'medium'
        ? 10_000
        : MAX_BODY_BYTE_LENGTH;

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          DEBUG_BUILD &&
            debug.log(INSTRUMENTATION_NAME, `Handling request.on("data") with maximum body size of ${maxBodySize}b`);

          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              try {
                const chunk = args[0] as Buffer | string;
                const bufferifiedChunk = Buffer.from(chunk);

                if (bodyByteLength < maxBodySize) {
                  chunks.push(bufferifiedChunk);
                  bodyByteLength += bufferifiedChunk.byteLength;
                } else if (DEBUG_BUILD) {
                  debug.log(
                    INSTRUMENTATION_NAME,
                    `Dropping request body chunk because maximum body length of ${maxBodySize}b is exceeded.`,
                  );
                }
              } catch (err) {
                DEBUG_BUILD && debug.error(INSTRUMENTATION_NAME, 'Encountered error while storing body chunk.');
              }

              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Ensure we also remove callbacks correctly
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.off = new Proxy(req.off, {
      apply: (target, thisArg, args: Parameters<typeof req.off>) => {
        const [, listener] = args;

        const callback = callbackMap.get(listener);
        if (callback) {
          callbackMap.delete(listener);

          const modifiedArgs = args.slice();
          modifiedArgs[1] = callback;
          return Reflect.apply(target, thisArg, modifiedArgs);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (body) {
          // Using Buffer.byteLength here, because the body may contain characters that are not 1 byte long
          const bodyByteLength = Buffer.byteLength(body, 'utf-8');
          const truncatedBody =
            bodyByteLength > maxBodySize
              ? `${Buffer.from(body)
                  .subarray(0, maxBodySize - 3)
                  .toString('utf-8')}...`
              : body;

          isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: truncatedBody } });
        }
      } catch (error) {
        if (DEBUG_BUILD) {
          debug.error(INSTRUMENTATION_NAME, 'Error building captured request body', error);
        }
      }
    });
  } catch (error) {
    if (DEBUG_BUILD) {
      debug.error(INSTRUMENTATION_NAME, 'Error patching request to capture body', error);
    }
  }
}
