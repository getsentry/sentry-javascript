import { subscribe } from 'node:diagnostics_channel';
import type * as http from 'node:http';
import { context, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import type {
  HttpClientRequest,
  HttpIncomingMessage,
  HttpInstrumentationOptions,
  HttpModuleExport,
  Span,
} from '@sentry/core';
import {
  getHttpClientSubscriptions,
  patchHttpModuleClient,
  patchHttpsModuleClient,
  SDK_VERSION,
  getRequestOptions,
} from '@sentry/core';
import { INSTRUMENTATION_NAME } from './constants';
import { HTTP_ON_CLIENT_REQUEST } from '@sentry/core';
import { NODE_VERSION } from '../../nodeVersion';
import { errorMonitor } from 'node:events';

const FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL =
  (NODE_VERSION.major === 22 && NODE_VERSION.minor >= 12) ||
  (NODE_VERSION.major === 23 && NODE_VERSION.minor >= 2) ||
  NODE_VERSION.major >= 24;

export type SentryHttpInstrumentationOptions = InstrumentationConfig & {
  /**
   * Whether breadcrumbs should be recorded for outgoing requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to propagate Sentry trace headers in outgoing requests.
   * By default this is done by the HttpInstrumentation, but if that is not added (e.g. because tracing is disabled)
   * then this instrumentation can take over.
   *
   * @default `false`
   */
  propagateTraceInOutgoingRequests?: boolean;

  /**
   * Whether to enable the capability to create spans for outgoing requests via diagnostic channels.
   * If enabled, spans will only be created if the `spans` option is also enabled (default: true).
   *
   * This is a feature flag that should be enabled by SDKs when the runtime supports it (Node 22.12+).
   * Individual users should not need to configure this directly.
   *
   * @default `false`
   */
  createSpansForOutgoingRequests?: boolean;

  /**
   * Whether to create spans for outgoing requests (user preference).
   * This only takes effect if `createSpansForOutgoingRequests` is also enabled.
   * If `createSpansForOutgoingRequests` is not enabled, this option is ignored.
   *
   * @default `true`
   */
  spans?: boolean;

  /**
   * Do not capture breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * For the scope of this instrumentation, this callback only controls breadcrumb creation.
   * The same option can be passed to the top-level httpIntegration where it controls both, breadcrumb and
   * span creation.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Hooks for outgoing request spans, called when `createSpansForOutgoingRequests` is enabled.
   * These mirror the OTEL HttpInstrumentation hooks for backwards compatibility.
   */
  outgoingRequestHook?: (span: Span, request: ClientRequest | HttpClientRequest) => void;
  outgoingResponseHook?: (span: Span, response: IncomingMessage | HttpIncomingMessage) => void;
  outgoingRequestApplyCustomAttributes?: (
    span: Span,
    request: HttpClientRequest,
    response: HttpIncomingMessage,
  ) => void;

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
 */
export class SentryHttpInstrumentation extends InstrumentationBase<SentryHttpInstrumentationOptions> {
  public constructor(config: SentryHttpInstrumentationOptions = {}) {
    super(INSTRUMENTATION_NAME, SDK_VERSION, config);
  }

  /** @inheritdoc */
  public init(): [InstrumentationNodeModuleDefinition, InstrumentationNodeModuleDefinition] {
    const { outgoingRequestApplyCustomAttributes: applyCustomAttributesOnSpan, ...options } = this.getConfig();
    const patchOptions: HttpInstrumentationOptions = {
      propagateTrace: options.propagateTraceInOutgoingRequests,
      applyCustomAttributesOnSpan,
      ...options,
      spans: options.createSpansForOutgoingRequests && (options.spans ?? true),
      ignoreOutgoingRequests(url, request) {
        return (
          isTracingSuppressed(context.active()) ||
          !!options.ignoreOutgoingRequests?.(url, getRequestOptions(request as ClientRequest))
        );
      },
      outgoingRequestHook(span, request) {
        options.outgoingRequestHook?.(span, request);
        // We monkey-patch `req.once('response'), which is used to trigger
        // the callback of the request, so that it runs in the active context
        // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
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

        // eslint-disable-next-line deprecation/deprecation
        request.once = newOnce;
      },
      outgoingResponseHook(span, response) {
        options.outgoingResponseHook?.(span, response);
        context.bind(context.active(), response);
      },
      errorMonitor,
    };

    // only generate the subscriber function if we'll actually use it
    const { [HTTP_ON_CLIENT_REQUEST]: onHttpClientRequestCreated } = FULLY_SUPPORTS_HTTP_DIAGNOSTICS_CHANNEL
      ? getHttpClientSubscriptions(patchOptions)
      : {};

    // guard because we cover both http and https with the same subscribers
    let hasRegisteredHandlers = false;
    const sub = onHttpClientRequestCreated
      ? <T extends HttpModuleExport>(moduleExports: T): T => {
          if (!hasRegisteredHandlers && onHttpClientRequestCreated) {
            hasRegisteredHandlers = true;
            subscribe(HTTP_ON_CLIENT_REQUEST, onHttpClientRequestCreated);
          }
          return moduleExports;
        }
      : undefined;

    const wrapHttp = sub ?? ((moduleExports: HttpModuleExport) => patchHttpModuleClient(moduleExports, patchOptions));

    const wrapHttps = sub ?? ((moduleExports: HttpModuleExport) => patchHttpsModuleClient(moduleExports, patchOptions));

    /**
     * You may be wondering why we register these diagnostics-channel listeners
     * in such a convoluted way (as InstrumentationNodeModuleDefinition...)˝,
     * instead of simply subscribing to the events once in here.
     * The reason for this is timing semantics: These functions are called once the http or https module is loaded.
     * If we'd subscribe before that, there seem to be conflicts with the OTEL native instrumentation in some scenarios,
     * especially the "import-on-top" pattern of setting up ESM applications.
     */
    return [
      new InstrumentationNodeModuleDefinition('http', ['*'], wrapHttp),
      new InstrumentationNodeModuleDefinition('https', ['*'], wrapHttps),
    ];
  }
}
