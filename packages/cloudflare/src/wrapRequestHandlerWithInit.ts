import type { CfProperties, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import { NETWORK_PROTOCOL_NAME, NETWORK_PROTOCOL_VERSION } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { getIsolationScope, safeCallback } from '@sentry/core';
import { wrapServerRequestHandler } from '@sentry/server-utils/request-handler';
import { DEBUG_BUILD } from './debug-build';
import { getHttpServerRequestOptions } from './integrations/httpServer';
import { flushDeferredChannelEvents } from './orchestrion-deferred-channels';
import type { CloudflareClient, CloudflareOptions } from './client';
import type { ExecutionContextCompat } from './executionContext';
import { flushAndDispose, getOriginalWaitUntil } from './flush';
import { addCloudResourceContext, addCultureContext } from './scope-utils';
import { getInvocationState, getInvocationWaitUntil } from './utils/invocationContext';
import { withInvocationIsolationScope } from './utils/invocationScope';

function getRequestErrorMechanismType(context: ExecutionContextCompat | undefined): string {
  // Durable Object fetch handlers use DO state as context (see instrumentDurableObjectWithSentry)
  return context && 'storage' in context ? 'auto.faas.cloudflare.durable_object' : 'auto.http.cloudflare';
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
 * requirement anyway — pass `init` from `sdk.ts` to get the full default integrations.
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

    // Emit any orchestrion channel events deferred at module scope (e.g. a top-level
    // `const app = new Hono()` wrapped by build-time instrumentation): we're now in a
    // request, where workerd allows publish, and init() above has registered subscribers.
    flushDeferredChannelEvents();

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
        request,
        client,
        // Without `AsyncLocalStorage`, `withInvocationIsolationScope` does not fork, and the scope it
        // passes in is not the current one. The request data has to go on the current scope, where
        // events captured in the handler read it.
        isolationScope: getIsolationScope(),
        options: getHttpServerRequestOptions(client),
        origin: 'auto.http.cloudflare',
        mechanism: captureErrors ? { handled: false, type: getRequestErrorMechanismType(context) } : undefined,
        attributes,
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
