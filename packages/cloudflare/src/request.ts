import type { CfProperties, ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import {
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
  withIsolationScope,
} from '@sentry/core';
import { captureIncomingRequestBody } from './integrations/httpServer';
import type { CloudflareOptions } from './client';
import { flushAndDispose } from './flush';
import { addCloudResourceContext, addCultureContext, addRequest } from './scope-utils';
import { init } from './sdk';
import { classifyResponseStreaming } from './utils/streaming';

interface RequestHandlerWrapperOptions {
  options: CloudflareOptions;
  request: Request<unknown, IncomingRequestCfProperties<unknown> | CfProperties<unknown>>;
  context: ExecutionContext | undefined;
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

/**
 * Wraps a cloudflare request handler in Sentry instrumentation
 */
export function wrapRequestHandler(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
): Promise<Response> {
  return withIsolationScope(async isolationScope => {
    const { options, request, captureErrors = true } = wrapperOptions;
    const context = wrapperOptions.context;

    const waitUntil = context?.waitUntil?.bind?.(context);

    const client = init({ ...options, ctx: context });
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

    Object.assign(
      attributes,
      httpHeadersToSpanAttributes(
        winterCGHeadersToDict(request.headers),
        getClient()?.getOptions().sendDefaultPii ?? false,
      ),
    );

    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';

    addCloudResourceContext(isolationScope);
    addRequest(isolationScope, request);
    if (request.cf) {
      addCultureContext(isolationScope, request.cf);

      if (typeof request.cf.httpProtocol === 'string') {
        attributes['network.protocol.name'] = request.cf.httpProtocol;
      }
    }

    if (client) {
      await captureIncomingRequestBody(client, request);
    }

    // Do not capture spans for OPTIONS and HEAD requests
    if (request.method === 'OPTIONS' || request.method === 'HEAD') {
      try {
        return await handler();
      } catch (e) {
        if (captureErrors) {
          captureException(e, { mechanism: { handled: false, type: 'auto.http.cloudflare' } });
        }
        throw e;
      } finally {
        waitUntil?.(flushAndDispose(client));
      }
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
              captureException(e, { mechanism: { handled: false, type: 'auto.http.cloudflare' } });
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
