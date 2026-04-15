import { subscribe } from 'node:diagnostics_channel';
import { errorMonitor } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { context, propagation } from '@opentelemetry/api';
import type { RPCMetadata } from '@opentelemetry/core';
import { getRPCMetadata, isTracingSuppressed, RPCType, setRPCMetadata } from '@opentelemetry/core';
import type {
  Event,
  HttpIncomingMessage,
  HttpServerResponse,
  HttpInstrumentationOptions,
  Integration,
  IntegrationFn,
  Span,
} from '@sentry/core';
import { debug, getIsolationScope, getHttpServerSpanSubscriptions, HTTP_ON_SERVER_REQUEST } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { NodeClient } from '../../sdk/client';

const INTEGRATION_NAME = 'Http.ServerSpans';

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

export interface HttpServerSpansIntegrationOptions extends HttpInstrumentationOptions {
  /**
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   * Spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;

  /**
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   * This helps reduce noise in your transactions.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Do not capture spans for incoming HTTP requests with the given status codes.
   * By default, spans with some 3xx and 4xx status codes are ignored (see @default).
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * @default `[[401, 404], [301, 303], [305, 399]]`
   */
  ignoreStatusCodes?: (number | [number, number])[];

  /**
   * @deprecated This is deprecated in favor of `incomingRequestSpanHook`.
   */
  instrumentation?: {
    requestHook?: (span: Span, req: ClientRequest | HttpIncomingMessage) => void;
    responseHook?: (span: Span, response: HttpIncomingMessage | HttpServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: ClientRequest | HttpIncomingMessage,
      response: IncomingMessage | HttpServerResponse,
    ) => void;
  };

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  onSpanCreated?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;
}

const _httpServerSpansIntegration = ((options: HttpServerSpansIntegrationOptions = {}) => {
  const ignoreStatusCodes = options.ignoreStatusCodes ?? [
    [401, 404],
    // 300 and 304 are possibly valid status codes we do not want to filter
    [301, 303],
    [305, 399],
  ];

  const { onSpanCreated } = options;
  // eslint-disable-next-line deprecation/deprecation
  const { requestHook, responseHook, applyCustomAttributesOnSpan } = options.instrumentation ?? {};

  // Guard against setup being called multiple times (e.g. if integration is shared)
  let isSetup = false;

  return {
    name: INTEGRATION_NAME,
    setup(_client: NodeClient) {
      if (typeof __SENTRY_TRACING__ !== 'undefined' && !__SENTRY_TRACING__) {
        return;
      }

      if (isSetup) {
        return;
      }
      isSetup = true;

      const spanOptions: HttpInstrumentationOptions = {
        ...options,

        // Use the real errorMonitor symbol so we do not swallow errors
        // before user-supplied 'error' handlers.
        errorMonitor,

        // Wrap ignoreIncomingRequests to also suppress spans when OTel
        // tracing is suppressed
        ignoreIncomingRequests: (urlPath: string, request: HttpIncomingMessage) => {
          if (isTracingSuppressed(context.active())) {
            return true;
          }
          return !!options.ignoreIncomingRequests?.(urlPath, request);
        },

        // Called as the outer wrapper around span creation
        // 1. Extract OTel propagation context from incoming headers
        // 2. Populate the OTel RPC metadata (so framework integrations like
        //    Express can later set the parameterized route)
        // 3. Bind the request/response objects to the propagated context so
        //    their event listeners fire in the correct async context
        wrapServerEmitRequest(request, response, normalizedRequest, next) {
          const propagatedCtx = propagation.extract(context.active(), normalizedRequest.headers ?? {});
          // Create RPC metadata so framework instrumentations can
          // populate route before we read it in onSpanEnd.
          // We set it here with a missing span, so that it can be
          // attached to the context for other integrations to find when
          // they fire in the server.emit('request') callbacks. Doing it
          // in this somewhat hacky way prevents having yet another wrapper
          // method to add the rpc metadata once the span is created, but
          // before next() is called to emit the 'request' event.
          const rpcMetadata = {
            type: RPCType.HTTP,
          } as unknown as RPCMetadata;
          const ctxWithRpc = setRPCMetadata(propagatedCtx, rpcMetadata);
          return context.with(ctxWithRpc, () => {
            context.bind(context.active(), request);
            context.bind(context.active(), response);
            // next() creates span and calls original server emit inside it
            return next();
          });
        },

        // Once the span exists, wire it into the RPC metadata so that
        // OTel framework integrations can update its name.
        onSpanCreated(span: Span, request: HttpIncomingMessage, response: HttpServerResponse) {
          const rpcMetadata = getRPCMetadata(context.active());
          if (rpcMetadata) {
            rpcMetadata.span = span;
          }

          // TODO v11: Remove the following three hooks, only onSpanCreated should remain
          requestHook?.(span, request);
          responseHook?.(span, response);
          applyCustomAttributesOnSpan?.(span, request, response);

          onSpanCreated?.(span, request, response);
        },

        // When the span ends, read the route that a framework integration
        // may have set on the RPC metadata and update the isolationScope
        // transaction name.
        onSpanEnd(_span: Span, request: HttpIncomingMessage, _response: HttpServerResponse) {
          const rpcMetadata = getRPCMetadata(context.active());
          if (rpcMetadata?.type === RPCType.HTTP && rpcMetadata.route !== undefined) {
            getIsolationScope().setTransactionName(`${request.method?.toUpperCase() || 'GET'} ${rpcMetadata.route}`);
          }
        },
      };

      const { [HTTP_ON_SERVER_REQUEST]: onHttpServerRequest } = getHttpServerSpanSubscriptions(spanOptions);
      subscribe(HTTP_ON_SERVER_REQUEST, onHttpServerRequest);
    },

    processEvent(event) {
      // Drop transaction if it has a status code that should be ignored
      if (event.type === 'transaction') {
        const statusCode = event.contexts?.trace?.data?.['http.response.status_code'];
        if (typeof statusCode === 'number') {
          const shouldDrop = shouldFilterStatusCode(statusCode, ignoreStatusCodes);
          if (shouldDrop) {
            DEBUG_BUILD && debug.log('Dropping transaction due to status code', statusCode);
            return null;
          }
        }
      }

      return event;
    },

    afterAllSetup(client) {
      if (!DEBUG_BUILD) {
        return;
      }

      if (client.getIntegrationByName('Http')) {
        debug.warn(
          'It seems that you have manually added `httpServerSpansIntergation` while `httpIntegration` is also present. Make sure to remove `httpIntegration` when adding `httpServerSpansIntegration`.',
        );
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * This integration emits spans for incoming requests handled via the node `http` module.
 *
 * When used standalone, it also handles request isolation and session tracking (via
 * `getHttpServerSpanSubscriptions`). When composed inside `httpIntegration` with spans
 * disabled, the plain `httpServerIntegration` handles those concerns instead.
 */
export const httpServerSpansIntegration = _httpServerSpansIntegration as (
  options?: HttpServerSpansIntegrationOptions,
) => Integration & {
  name: 'HttpServerSpans';
  setup: (client: NodeClient) => void;
  processEvent: (event: Event) => Event | null;
};

/**
 * If the given status code should be filtered for the given list of status codes/ranges.
 */
function shouldFilterStatusCode(statusCode: number, dropForStatusCodes: (number | [number, number])[]): boolean {
  return dropForStatusCodes.some(code => {
    if (typeof code === 'number') {
      return code === statusCode;
    }

    const [min, max] = code;
    return statusCode >= min && statusCode <= max;
  });
}
