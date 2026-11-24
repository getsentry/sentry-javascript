import type { CfProperties, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import { NETWORK_PROTOCOL_NAME, NETWORK_PROTOCOL_VERSION } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { addNonEnumerableProperty, getIsolationScope, safeCallback } from '@sentry/core';
import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_setScopeFlushedByRuntime as setScopeFlushedByRuntime,
} from '@sentry/core/server';
import { wrapServerRequestHandler } from '@sentry/server-utils/request-handler';
import { DEBUG_BUILD } from './debug-build';
import { getHttpServerRequestOptions } from './integrations/httpServer';
import { flushDeferredChannelEvents } from './orchestrion-deferred-channels';
import type { CloudflareClient, CloudflareOptions } from './client';
import type { ExecutionContextCompat } from './executionContext';
import { flushAndDispose, getOriginalWaitUntil } from './flush';
import { addCloudResourceContext, addCultureContext } from './scope-utils';
import { continueCloudflareTrace } from './utils/cloudflareTrace';
import { getInvocationState, getInvocationWaitUntil } from './utils/invocationContext';
import { withInvocationIsolationScope } from './utils/invocationScope';

function isDurableObjectContext(context: ExecutionContextCompat | undefined): boolean {
  // Durable Object fetch handlers use DO state as context (see instrumentDurableObjectWithSentry)
  return !!context && 'storage' in context;
}

function getRequestErrorMechanismType(context: ExecutionContextCompat | undefined): string {
  return isDurableObjectContext(context) ? 'auto.faas.cloudflare.durable_object' : 'auto.http.cloudflare';
}

/**
 * vinext's Workers Cache adapter issues its response-stage request with internal data:
 * `__vinext_*` query parameters and `x-vinext-internal-*` headers, which can carry unfiltered
 * query values. The SDK must not record them. Returns the original request when it carries no
 * vinext data, so non-vinext traffic is untouched.
 */
function stripVinextInternalData(
  request: Request<unknown, IncomingRequestCfProperties<unknown> | CfProperties<unknown>>,
): Request<unknown, IncomingRequestCfProperties<unknown> | CfProperties<unknown>> {
  try {
    const url = new URL(request.url);
    const vinextQueryParams = [...url.searchParams.keys()].filter(key => key.startsWith('__vinext_'));
    const headers = new Headers(request.headers);
    const vinextHeaders = [...headers.keys()].filter(name => name.startsWith('x-vinext-internal-'));
    if (vinextQueryParams.length === 0 && vinextHeaders.length === 0) {
      return request;
    }
    for (const key of vinextQueryParams) {
      url.searchParams.delete(key);
    }
    for (const name of vinextHeaders) {
      headers.delete(name);
    }
    // The sanitized copy carries no body: the recording path only reads its method, URL and
    // headers (the body is only read for the best-effort `normalizedRequest.data`, see
    // `captureBodyFromWinterCGRequest`), and a teed body would leave an unread branch that
    // backpressures the original body on workerd. The handler still receives the original.
    const sanitized = new Request(url.toString(), {
      method: request.method,
      headers,
      signal: request.signal,
      cf: request.cf,
    });
    // `wrapServerRequestHandler` passes this request to the `onSpanCreated`/`onSpanEnd` and
    // `ignoreIncomingRequests`/`ignoreRequestBody` callbacks, which read Cloudflare metadata
    // off it. `cf` in `RequestInit` is honored by workerd but ignored by some runtimes
    // (undici drops it), so attach it directly when it did not survive construction.
    if (sanitized.cf === undefined && request.cf !== undefined) {
      addNonEnumerableProperty(sanitized, 'cf', request.cf);
    }
    return sanitized;
  } catch {
    // Never break the request to hide data: if sanitizing fails, record the original.
    return request;
  }
}

export interface RequestHandlerWrapperOptions {
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
 * Same as {@link wrapRequestHandler}, but with the SDK initialization injected.
 *
 * Wrappers that are only reachable from the main entry point — where `nodejs_compat` is a
 * requirement anyway — pass `init` from `sdk.ts` so `enableOpenTelemetrySetup` is honored.
 *
 * @internal
 */
export function wrapRequestHandlerWithInit(
  wrapperOptions: RequestHandlerWrapperOptions,
  handler: (...args: unknown[]) => Response | Promise<Response>,
  initSdk: InitSdk,
): Promise<Response> {
  return withInvocationIsolationScope(async isolationScope => {
    const { options, request, captureErrors = true } = wrapperOptions;
    const context = wrapperOptions.context;

    // The un-instrumented waitUntil, so flushAndDispose cannot deadlock on the flush
    // lock's own wrapper. Resolved once per invocation and cached on its state; reading
    // `ctx.waitUntil` on a native context is a runtime getter call.
    const invocationState = getInvocationState();
    const waitUntil = invocationState
      ? getInvocationWaitUntil(invocationState)
      : context
        ? getOriginalWaitUntil(context).bind(context)
        : undefined;

    const client = initSdk({ ...options, ctx: context });
    isolationScope.setClient(client);

    // This wrap flushes through `waitUntil` once the response is sent, so a framework's own `flushIfServerless()`
    // (e.g. the Astro middleware on Pages) would only hold the response for a flush that is coming anyway.
    if (waitUntil) {
      setScopeFlushedByRuntime(isolationScope);
    }

    // Emit any orchestrion channel events deferred at module scope (e.g. a top-level
    // `const app = new Hono()` wrapped by build-time instrumentation): we're now in a
    // request, where workerd allows publish, and init() above has registered subscribers.
    flushDeferredChannelEvents();

    // The tunnel answers these before the app, with no span. A Durable Object is only reached through the Worker,
    // which answered them already.
    const tunnelResponse = !isDurableObjectContext(context) && handleServedTunnelRequest(request, client);
    if (tunnelResponse) {
      return tunnelResponse.finally(() => waitUntil?.(flushAndDispose(client)));
    }

    addCloudResourceContext(isolationScope);
    const attributes: SpanAttributes = {};
    if (request.cf) {
      addCultureContext(isolationScope, request.cf);

      if (typeof request.cf.httpProtocol === 'string') {
        const [protocolName, protocolVersion] = request.cf.httpProtocol.toLowerCase().split('/');
        attributes[NETWORK_PROTOCOL_NAME] = protocolName;
        attributes[NETWORK_PROTOCOL_VERSION] = protocolVersion;
      }
    }

    if (!client) {
      try {
        return await handler();
      } finally {
        waitUntil?.(flushAndDispose(client));
      }
    }

    // Note: The span will not have a duration unless I/O happens in the handler. This is
    // because of how the cloudflare workers runtime works.
    // See: https://developers.cloudflare.com/workers/runtime-apis/performance/
    return wrapServerRequestHandler(
      {
        // The response-stage request of vinext's Workers Cache adapter carries vinext's internal
        // data; record a sanitized copy so it does not land in spans or error events. The handler
        // itself still receives the original request.
        request: stripVinextInternalData(request),
        client,
        // Without `AsyncLocalStorage`, `withInvocationIsolationScope` does not fork, and the scope it
        // passes in is not the current one. The request data has to go on the current scope, where
        // events captured in the handler read it.
        isolationScope: getIsolationScope(),
        options: getHttpServerRequestOptions(client),
        origin: 'auto.http.cloudflare',
        mechanism: captureErrors ? { handled: false, type: getRequestErrorMechanismType(context) } : undefined,
        attributes,
        onTraceContinued: () => continueCloudflareTrace(context),
        isStreamingResponse: response => {
          const classification = safeCallback(
            DEBUG_BUILD ? 'Error in `isStreamingResponse`, using the default classification:' : '',
            () => options.isStreamingResponse?.(response, request),
            () => undefined,
          );
          // An async callback returns a promise, which would otherwise count as `true`.
          return typeof classification === 'boolean' ? classification : undefined;
        },
        onDone: response => {
          // Don't dispose for protocol upgrades (101 Switching Protocols) - the connection stays alive.
          // This includes WebSocket upgrades where webSocketMessage/webSocketClose handlers
          // will still be called and may need the client to capture errors.
          if (response?.status === 101) {
            waitUntil?.(client.flush(2000));
          } else {
            waitUntil?.(flushAndDispose(client));
          }
        },
      },
      () => handler(),
    );
  }, wrapperOptions.context);
}
