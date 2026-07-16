import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { context, trace } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import type { HttpClientRequest, HttpIncomingMessage, HttpInstrumentationOptions, Span } from '@sentry/core';
import {
  getHttpClientSubscriptions,
  patchHttpModuleClient,
  SDK_VERSION,
  getRequestOptions,
  isTracingSuppressed,
} from '@sentry/core';
import { INSTRUMENTATION_NAME } from './constants';
import { HTTP_ON_CLIENT_REQUEST } from '@sentry/core';
import { NODE_VERSION } from '../../nodeVersion';
import { errorMonitor } from 'node:events';
import * as http from 'node:http';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL =
  (NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12) ||
  (NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2) ||
  NODE_VERSION.major >= 24;

interface OutgoingHttpRequestInstrumentationOptions {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to create spans for outgoing requests (user preference).
   * This only takes effect if `createSpansForOutgoingRequests` is not disabled.
   * If `createSpansForOutgoingRequests` is explicitly set false, this option is ignored.
   *
   * @default `true`
   */
  spans?: boolean;

  /**
   * Whether to propagate Sentry trace headers in outgoing requests.
   *
   * @default `true`
   */
  propagateTraceInOutgoingRequests?: boolean;

  /**
   * @deprecated Use spans option instead.
   *
   * @default `true`
   */
  createSpansForOutgoingRequests?: boolean;

  /**
   * Do not instrument outgoing HTTP requests to URLs where the given callback returns `true`.
   * When it returns `true`, the request is skipped entirely: no breadcrumb and no span are created,
   * and no trace headers are propagated for that request.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Hooks for outgoing request spans, only called when spans are created for outgoing requests
   * (i.e. when `spans` is enabled).
   * These mirror the OTEL HttpInstrumentation hooks for backwards compatibility.
   */
  outgoingRequestHook?: (span: Span, request: ClientRequest | HttpClientRequest) => void;
  outgoingResponseHook?: (span: Span, response: IncomingMessage | HttpIncomingMessage) => void;
  outgoingRequestApplyCustomAttributes?: (
    span: Span,
    request: HttpClientRequest,
    response: HttpIncomingMessage,
  ) => void;
}

export type SentryHttpInstrumentationOptions = InstrumentationConfig &
  OutgoingHttpRequestInstrumentationOptions & {
    // All options below do not do anything anymore in this instrumentation, and will be removed in the future.
    // They are only kept here for backwards compatibility - the respective functionality is now handled by the httpServerIntegration/httpServerSpansIntegration.

    /**
     * @deprecated This no longer does anything.
     */
    extractIncomingTraceFromHeader?: boolean;

    /**
     * @deprecated This no longer does anything.
     */
    ignoreStaticAssets?: boolean;

    /**
     * @deprecated This no longer does anything.
     */
    disableIncomingRequestSpans?: boolean;

    /**
     * @deprecated This no longer does anything.
     */
    ignoreSpansForIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;

    /**
     * @deprecated This no longer does anything.
     */
    ignoreIncomingRequestBody?: (url: string, request: http.RequestOptions) => boolean;

    /**
     * @deprecated This no longer does anything.
     */
    maxIncomingRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

    /**
     * @deprecated This no longer does anything.
     */
    trackIncomingRequestsAsSessions?: boolean;

    /**
     * @deprecated This no longer does anything.
     */
    instrumentation?: {
      requestHook?: (span: Span, req: ClientRequest | IncomingMessage) => void;
      responseHook?: (span: Span, response: IncomingMessage | ServerResponse) => void;
      applyCustomAttributesOnSpan?: (
        span: Span,
        request: ClientRequest | IncomingMessage,
        response: IncomingMessage | ServerResponse,
      ) => void;
    };

    /**
     * @deprecated This no longer does anything.
     */
    sessionFlushingDelayMS?: number;
  };

/**
 * This instruments the http modules for outgoing requests.
 * It uses the diagnostics channel if available, otherwise it falls back to monkey-patching.
 *
 * The instrumentation will start spans, create breadcrumbs, and propagate trace headers in outgoing requests (depending on the settings).
 * This can be called multiple times, where the last invocation will have the current options.
 *
 * @TODO Cleanup options in v11
 */
export function instrumentHttpOutgoingRequests(
  instrumentationOptions: OutgoingHttpRequestInstrumentationOptions = {},
): void {
  const { outgoingRequestApplyCustomAttributes: applyCustomAttributesOnSpan, ...options } = instrumentationOptions;
  const patchOptions = {
    propagateTrace: options.propagateTraceInOutgoingRequests ?? true,
    applyCustomAttributesOnSpan,
    ...options,
    // oxlint-disable-next-line typescript/no-deprecated
    spans: options.createSpansForOutgoingRequests !== false && (options.spans ?? true),
    ignoreOutgoingRequests(url, request) {
      return (
        isTracingSuppressed() || !!options.ignoreOutgoingRequests?.(url, getRequestOptions(request as ClientRequest))
      );
    },
    outgoingRequestHook(span, request) {
      options.outgoingRequestHook?.(span, request);
      // We monkey-patch `req.once('response'), which is used to trigger
      // the callback of the request, so that it runs in the active context
      // eslint-disable-next-line @typescript-eslint/unbound-method, typescript/no-deprecated
      const originalOnce = request.once;

      const newOnce = new Proxy(originalOnce, {
        apply(target, thisArg, args: Parameters<typeof originalOnce>) {
          const [event] = args;
          if (event !== 'response') {
            return target.apply(thisArg, args);
          }

          const parentContext = context.active();
          const requestContext = trace.setSpan(parentContext, span);

          return context.with(requestContext, () => {
            return target.apply(thisArg, args);
          });
        },
      });

      // eslint-disable-next-line typescript/no-deprecated
      request.once = newOnce;
    },
    outgoingResponseHook(span, response) {
      options.outgoingResponseHook?.(span, response);
    },
    errorMonitor,
    // Pass these in to detect OTel double-wrapping if we're enabling spans
    http,
  } satisfies HttpInstrumentationOptions;

  if (FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL) {
    instrumentHttpOutgoingRequestsViaChannel(patchOptions);
  } else {
    instrumentHttpOutgoingRequestsViaMonkeyPatching(patchOptions);
  }
}

let _currentListener: ChannelListener | undefined;
function instrumentHttpOutgoingRequestsViaChannel(options: HttpInstrumentationOptions): void {
  const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = getHttpClientSubscriptions(options);
  // If it was previously subscribed, first unsubscribe it
  // TODO(v11): We can likely remove this when we drop preload support
  if (_currentListener) {
    unsubscribe(HTTP_ON_CLIENT_REQUEST, _currentListener);
  }

  subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);
  _currentListener = onHttpClientRequestCreated;
}

/**
 * Instrument outgoing HTTP(S) requests by old-school monkey-patching the `http` module.
 * This is the fallback for runtimes that do not fully support the `node:http` client diagnostics channel
 * (Node < 22.12).
 */
function instrumentHttpOutgoingRequestsViaMonkeyPatching(options: HttpInstrumentationOptions): void {
  // Patching http also patches https, as this uses the same underlying object
  patchHttpModuleClient(http, options);
}

/**
 * This custom HTTP instrumentation handles outgoing HTTP requests.
 *
 * It provides:
 * - Breadcrumbs for all outgoing requests
 * - Trace propagation headers (when enabled)
 * - Span creation for outgoing requests (when createSpansForOutgoingRequests is enabled)
 *
 * Span creation requires Node 22+ and uses diagnostic channels to avoid monkey-patching.
 * By default, this is only enabled in the node SDK, not in node-core or other runtime SDKs.
 *
 * Important note: Contrary to other OTEL instrumentation, this one cannot be unwrapped.
 *
 * This is heavily inspired & adapted from:
 * https://github.com/open-telemetry/opentelemetry-js/blob/f8ab5592ddea5cba0a3b33bf8d74f27872c0367f/experimental/packages/opentelemetry-instrumentation-http/src/http.ts
 *
 * @deprecated This will be removed in v11. Use instrumentHttpOutgoingRequests() instead.
 */
export class SentryHttpInstrumentation extends InstrumentationBase<SentryHttpInstrumentationOptions> {
  public constructor(config: SentryHttpInstrumentationOptions = {}) {
    super(INSTRUMENTATION_NAME, SDK_VERSION, config);
  }

  /** @inheritdoc */
  public init(): void {
    instrumentHttpOutgoingRequests(this.getConfig());
  }
}
