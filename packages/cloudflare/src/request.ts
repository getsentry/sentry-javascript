import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import {
  captureException,
  continueTrace,
  flush,
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
import type { CloudflareOptions } from './client';
import { addCloudResourceContext, addCultureContext, addRequest } from './scope-utils';
import { init } from './sdk';
import { classifyResponseStreaming } from './utils/streaming';

interface RequestHandlerWrapperOptions {
  options: CloudflareOptions;
  request: Request<unknown, IncomingRequestCfProperties<unknown>>;
  context: ExecutionContext;
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

    // In certain situations, the passed context can become undefined.
    // For example, for Astro while prerendering pages at build time.
    // see: https://github.com/getsentry/sentry-javascript/issues/13217
    const context = wrapperOptions.context as ExecutionContext | undefined;

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
      attributes['network.protocol.name'] = request.cf.httpProtocol;
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
        waitUntil?.(flush(2000));
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
            waitUntil?.(flush(2000));
            throw e;
          }

          // Classify response to detect actual streaming
          const classification = classifyResponseStreaming(res);

          if (classification.isStreaming && res.body) {
            // Streaming response detected - monitor consumption to keep span alive
            try {
              const [clientStream, monitorStream] = res.body.tee();

              // Monitor stream consumption and end span when complete
              const streamMonitor = (async () => {
                const reader = monitorStream.getReader();

                try {
                  let done = false;
                  while (!done) {
                    const result = await reader.read();
                    done = result.done;
                  }
                } catch {
                  // Stream error or cancellation - will end span in finally
                } finally {
                  reader.releaseLock();
                  span.end();
                  waitUntil?.(flush(2000));
                }
              })();

              // Keep worker alive until stream monitoring completes (otherwise span won't end)
              waitUntil?.(streamMonitor);

              // Return response with client stream
              return new Response(clientStream, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
              });
            } catch (e) {
              // tee() failed (e.g stream already locked) - fall back to non-streaming handling
              span.end();
              waitUntil?.(flush(2000));
              return res;
            }
          }

          // Non-streaming response - end span immediately and return original
          span.end();
          waitUntil?.(flush(2000));
          return res;
        });
      },
    );
  });
}
