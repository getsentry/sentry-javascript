import type { ExecutionContext, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { Scope } from '@sentry/core';
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
import type { CloudflareClient, CloudflareOptions } from './client';
import { addCloudResourceContext, addCultureContext, addRequest } from './scope-utils';
import { init } from './sdk';
import { classifyResponseStreaming } from './utils/streaming';

/**
 * Flushes the client and then disposes of it to allow garbage collection.
 * This should be called at the end of each request to prevent memory leaks.
 *
 * @param client - The CloudflareClient instance to flush and dispose
 * @param timeout - Timeout in milliseconds for the flush operation
 * @returns A promise that resolves when flush and dispose are complete
 */
async function flushAndDispose(client: CloudflareClient | undefined, timeout: number): Promise<void> {
  await flush(timeout);
  client?.dispose();
}

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

/** Returns true when tracing is effectively disabled - enables fast path with less CPU/memory usage. */
function isTracingDisabled(options: CloudflareOptions): boolean {
  const rate = options.tracesSampleRate;
  return rate === 0 || rate === undefined || !Number.isFinite(rate);
}

/**
 * Lightweight handler path when tracing is disabled - skips span creation, header iteration,
 * and streaming response handling to reduce CPU and memory usage.
 *
 * Key optimizations:
 * - Defers header processing until an error occurs (lazy addRequest)
 * - Skips continueTrace when no incoming trace headers present
 * - Minimizes object allocations in the hot path
 */
async function runHandlerWithoutTracing(
  isolationScope: Scope,
  options: CloudflareOptions,
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  context: ExecutionContext | undefined,
  captureErrors: boolean,
  handler: () => Response | Promise<Response>,
): Promise<Response> {
  // Get the original uninstrumented context if available (from instrumentContext wrapper)
  // This avoids accessing the proxied waitUntil which creates a bound function
  // that retains the context and prevents GC
  const originalContext = (context as { _originalContext?: ExecutionContext } | undefined)?._originalContext ?? context;

  // Store original waitUntil BEFORE init() wraps it with makeFlushLock
  // This avoids deadlock where flush() waits for finalize() while wrapped in waitUntil
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalWaitUntil = originalContext?.waitUntil;

  // Pass ctx directly to avoid object spread overhead
  options.ctx = context;
  const client = init(options);
  isolationScope.setClient(client);

  // Lightweight context - skip expensive header iteration
  addCloudResourceContext(isolationScope);
  if (request.cf) {
    addCultureContext(isolationScope, request.cf);
  }

  // Check if we have incoming trace headers - skip continueTrace if not present
  const sentryTraceHeader = request.headers.get('sentry-trace');
  const hasSentryTrace = sentryTraceHeader && sentryTraceHeader.length > 0;

  const runHandler = async (): Promise<Response> => {
    try {
      return await handler();
    } catch (e) {
      if (captureErrors) {
        // Only process request headers when an error actually occurs (lazy evaluation)
        addRequest(isolationScope, request);
        captureException(e, { mechanism: { handled: false, type: 'auto.http.cloudflare' } });
      }
      throw e;
    } finally {
      // Use original waitUntil (not wrapped) to avoid deadlock
      // Use .call() instead of .bind() to avoid creating bound function that retains context
      // Flush and dispose to allow garbage collection
      if (originalWaitUntil && originalContext) {
        originalWaitUntil.call(originalContext, flushAndDispose(client, 2000));
      }
    }
  };

  // Skip continueTrace overhead when no incoming trace - just run the handler directly
  if (!hasSentryTrace) {
    return runHandler();
  }

  // Only use continueTrace when there's an actual incoming trace to continue
  return continueTrace(
    { sentryTrace: sentryTraceHeader, baggage: request.headers.get('baggage') },
    runHandler,
  );
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

    // Fast path: when tracing is disabled, skip span creation and expensive operations
    // (header iteration, URL parsing, streaming handling) to reduce CPU and memory usage.
    if (isTracingDisabled(options)) {
      return runHandlerWithoutTracing(isolationScope, options, request, context, captureErrors, () => handler());
    }

    // Get the original uninstrumented context if available (from instrumentContext wrapper)
    // This avoids accessing the proxied waitUntil which creates a bound function
    // that retains the context and prevents GC
    const originalContext = (context as { _originalContext?: ExecutionContext } | undefined)?._originalContext ?? context;

    // Store original waitUntil BEFORE init() wraps it with makeFlushLock
    // This avoids deadlock where flush() waits for finalize() while wrapped in waitUntil
    // Use function reference + .call() instead of .bind() to avoid creating bound function
    // that keeps context permanently alive and prevents GC
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalWaitUntil = originalContext?.waitUntil;

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
        // Use original waitUntil with .call() to avoid bound function retaining context
        // Flush and dispose to allow garbage collection
        originalWaitUntil?.call(originalContext, flushAndDispose(client, 2000));
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
            // Use original waitUntil with .call() to avoid bound function retaining context
            // Flush and dispose to allow garbage collection
            originalWaitUntil?.call(originalContext, flushAndDispose(client, 2000));
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
                  // Use original waitUntil with .call() to avoid bound function retaining context
                  // Flush and dispose to allow garbage collection
                  originalWaitUntil?.call(originalContext, flushAndDispose(client, 2000));
                }
              })();

              // Keep worker alive until stream monitoring completes (otherwise span won't end)
              // Use original waitUntil with .call() to avoid bound function retaining context
              originalWaitUntil?.call(originalContext, streamMonitor);

              // Return response with client stream
              return new Response(clientStream, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
              });
            } catch (e) {
              // tee() failed (e.g stream already locked) - fall back to non-streaming handling
              span.end();
              // Use original waitUntil with .call() to avoid bound function retaining context
              // Flush and dispose to allow garbage collection
              originalWaitUntil?.call(originalContext, flushAndDispose(client, 2000));
              return res;
            }
          }

          // Non-streaming response - end span immediately and return original
          span.end();
          // Use original waitUntil with .call() to avoid bound function retaining context
          // Flush and dispose to allow garbage collection
          originalWaitUntil?.call(originalContext, flushAndDispose(client, 2000));
          return res;
        });
      },
    );
  });
}
