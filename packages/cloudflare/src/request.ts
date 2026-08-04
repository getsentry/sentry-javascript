import type { CfProperties, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import {
  captureException,
  continueTrace,
  getHttpSpanDetailsFromUrlObject,
  httpHeadersToSpanAttributes,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  setHttpStatus,
  startSpanManual,
  winterCGHeadersToDict,
  withIsolationScope,
} from '@sentry/core';
import { captureIncomingRequestBody } from './integrations/httpServer';
import { initBaseSdk } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import type { ExecutionContextCompat } from './executionContext';
import { flushAndDispose, getOriginalWaitUntil } from './flush';
import { addCloudResourceContext, addCultureContext, addRequest } from './scope-utils';
import { classifyResponseStreaming } from './utils/streaming';

function getRequestErrorMechanismType(context: ExecutionContextCompat | undefined): string {
  // Durable Object fetch handlers use DO state as context (see instrumentDurableObjectWithSentry)
  return context && 'storage' in context ? 'auto.faas.cloudflare.durable_object' : 'auto.http.cloudflare';
}

interface RequestHandlerWrapperOptions {
  options: CloudflareOptions;
  request: Request<unknown, IncomingRequestCfProperties<unknown> | CfProperties<unknown>>;
  context: ExecutionContextCompat | undefined;
  /**
   * If true, errors will be captured, rethrown and sent to Sentry.
   * Otherwise, errors are rethrown but not captured.
   *
   * You most likely don't want to set this to `false`, if you use `wrapRequestHandler` directly.
   * This is primarily meant as an escape hatch for higher-level SDKs relying on additional error
   * capturing mechanisms where this wrapper captures errors too early or too generally.
   *
   * @default true
   */
  captureErrors?: boolean;
}

type InitSdk = (options: CloudflareOptions) => CloudflareClient | undefined;

/**
 * Wraps a cloudflare request handler in Sentry instrumentation.
 *
 * The client is set up with the default integrations that work without the `nodejs_compat`
 * compatibility flag, so that this also works on runtimes that cannot enable it (e.g. Shopify
 * Oxygen). On a runtime that has `nodejs_compat`, pass `defaultIntegrations:
 * getDefaultIntegrations(options)` in `options` to get the full set instead.
 */
export function wrapRequestHandler(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
): Promise<Response> {
  return wrapRequestHandlerWithInit(wrapperOptions, handler, initBaseSdk);
}

/**
 * Same as {@link wrapRequestHandler}, but with the SDK initialization injected.
 *
 * Wrappers that are only reachable from the main entry point — where `nodejs_compat` is a
 * requirement anyway — pass `init` from `sdk.ts` to get the full default integrations.
 *
 * @internal
 */
export function wrapRequestHandlerWithInit(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
  initSdk: InitSdk,
): Promise<Response> {
  return withIsolationScope(async isolationScope => {
    const { options, request, captureErrors = true } = wrapperOptions;
    const context = wrapperOptions.context;

    // Use getOriginalWaitUntil to get the un-instrumented waitUntil function.
    // This is crucial to avoid deadlock: the flush lock mechanism wraps waitUntil
    // to track pending tasks. If we use the instrumented version for flushAndDispose,
    // it acquires the lock, then flushAndDispose tries to wait for the same lock,
    // creating a deadlock.
    const waitUntil = context ? getOriginalWaitUntil(context)?.bind(context) : undefined;
    const errorMechanismType = getRequestErrorMechanismType(context);

    const client = initSdk({ ...options, ctx: context });
    isolationScope.setClient(client);

    const urlObject = parseStringToURLObject(request.url);
    const [name, attributes] = getHttpSpanDetailsFromUrlObject(urlObject, 'server', 'auto.http.cloudflare', request);

    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      attributes['http.request.body.size'] = parseInt(contentLength, 10);
    }

    const userAgentHeader = request.headers.get('user-agent');
    if (userAgentHeader) {
      attributes['user_agent.original'] = userAgentHeader;
    }

    if (client) {
      Object.assign(
        attributes,
        httpHeadersToSpanAttributes(winterCGHeadersToDict(request.headers), client.getDataCollectionOptions()),
      );
    }

    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';

    addCloudResourceContext(isolationScope);
    addRequest(isolationScope, request);
    if (request.cf) {
      addCultureContext(isolationScope, request.cf);

      if (typeof request.cf.httpProtocol === 'string') {
        attributes['network.protocol.name'] = request.cf.httpProtocol;
      }
    }

    // Do not capture spans for OPTIONS and HEAD requests
    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      try {
        return await handler();
      } catch (e) {
        if (captureErrors) {
          captureException(e, { mechanism: { handled: false, type: errorMechanismType } });
        }
        throw e;
      } finally {
        waitUntil?.(flushAndDispose(client));
      }
    }

    if (client) {
      await captureIncomingRequestBody(client, request);
    }

    return continueTrace(
      { sentryTrace: request.headers.get('sentry-trace') || '', baggage: request.headers.get('baggage') },
      () => {
        // Note: This span will not have a duration unless I/O happens in the handler. This is
        // because of how the cloudflare workers runtime works.
        // See: https://developers.cloudflare.com/workers/runtime-apis/performance/

        // Use startSpanManual to control when span ends (needed for streaming responses)
        return startSpanManual({ name, attributes }, async span => {
          let res: Response;

          try {
            res = await handler();
            setHttpStatus(span, res.status);

            // After the handler runs, the span name might have been updated by nested instrumentation
            // (e.g., Remix parameterizing routes). The span should already have the correct name
            // from that instrumentation, so we don't need to do anything here.
          } catch (e) {
            span.end();
            if (captureErrors) {
              captureException(e, { mechanism: { handled: false, type: errorMechanismType } });
            }
            waitUntil?.(flushAndDispose(client));
            throw e;
          }

          // Classify response to detect actual streaming
          const classification = classifyResponseStreaming(res);

          if (classification.isStreaming && res.body) {
            try {
              let ended = false;

              const endSpanOnce = (): void => {
                if (ended) return;

                ended = true;
                span.end();
                waitUntil?.(flushAndDispose(client));
              };

              const transform = new TransformStream({
                flush() {
                  // Source stream completed normally.
                  endSpanOnce();
                },
                cancel() {
                  // Client disconnected (or downstream cancelled). The `cancel`
                  // is being called while the response is still considered
                  // active, so this is a safe place to end the span.
                  endSpanOnce();
                },
              });

              return new Response(res.body.pipeThrough(transform), {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
              });
            } catch {
              span.end();
              waitUntil?.(flushAndDispose(client));
              return res;
            }
          }

          // Non-streaming response - end span immediately and return original
          span.end();

          // Don't dispose for protocol upgrades (101 Switching Protocols) - the connection stays alive.
          // This includes WebSocket upgrades where webSocketMessage/webSocketClose handlers
          // will still be called and may need the client to capture errors.
          if (res.status === 101) {
            waitUntil?.(client?.flush(2000));
          } else {
            waitUntil?.(flushAndDispose(client));
          }
          return res;
        });
      },
    );
  });
}
