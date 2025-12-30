import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type * as http from 'node:http';
import type * as https from 'node:https';
import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import type { Span } from '@sentry/core';
import { debug, LRUMap, SDK_VERSION } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { INSTRUMENTATION_NAME } from './constants';
import {
  addRequestBreadcrumb,
  addTracePropagationHeadersToOutgoingRequest,
  getRequestOptions,
} from './outgoing-requests';

type Http = typeof http;
type Https = typeof https;

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
   * Do not capture breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * For the scope of this instrumentation, this callback only controls breadcrumb creation.
   * The same option can be passed to the top-level httpIntegration where it controls both, breadcrumb and
   * span creation.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * @param request Contains the {@type RequestOptions} object used to make the outgoing request.
   */
  ignoreOutgoingRequests?: (url: string, request: http.RequestOptions) => boolean;

  // All options below do not do anything anymore in this instrumentation, and will be removed in the future.
  // They are only kept here for backwards compatibility - the respective functionality is now handled by the httpServerIntegration/httpServerSpansIntegration.

  /**
   * @deprecated This no longer does anything.
   */
  spans?: boolean;

  /**
   * @depreacted This no longer does anything.
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
  ignoreSpansForIncomingRequests?: (urlPath: string, request: http.IncomingMessage) => boolean;

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
    requestHook?: (span: Span, req: http.ClientRequest | http.IncomingMessage) => void;
    responseHook?: (span: Span, response: http.IncomingMessage | http.ServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: http.ClientRequest | http.IncomingMessage,
      response: http.IncomingMessage | http.ServerResponse,
    ) => void;
  };

  /**
   * @deprecated This no longer does anything.
   */
  sessionFlushingDelayMS?: number;
};

/**
 * This custom HTTP instrumentation is used to isolate incoming requests and annotate them with additional information.
 * It does not emit any spans.
 *
 * The reason this is isolated from the OpenTelemetry instrumentation is that users may overwrite this,
 * which would lead to Sentry not working as expected.
 *
 * Important note: Contrary to other OTEL instrumentation, this one cannot be unwrapped.
 * It only does minimal things though and does not emit any spans.
 *
 * This is heavily inspired & adapted from:
 * https://github.com/open-telemetry/opentelemetry-js/blob/f8ab5592ddea5cba0a3b33bf8d74f27872c0367f/experimental/packages/opentelemetry-instrumentation-http/src/http.ts
 */
export class SentryHttpInstrumentation extends InstrumentationBase<SentryHttpInstrumentationOptions> {
  private _propagationDecisionMap: LRUMap<string, boolean>;
  private _ignoreOutgoingRequestsMap: WeakMap<http.ClientRequest, boolean>;

  public constructor(config: SentryHttpInstrumentationOptions = {}) {
    super(INSTRUMENTATION_NAME, SDK_VERSION, config);

    this._propagationDecisionMap = new LRUMap<string, boolean>(100);
    this._ignoreOutgoingRequestsMap = new WeakMap<http.ClientRequest, boolean>();
  }

  /** @inheritdoc */
  public init(): [InstrumentationNodeModuleDefinition, InstrumentationNodeModuleDefinition] {
    // We register handlers when either http or https is instrumented
    // but we only want to register them once, whichever is loaded first
    let hasRegisteredHandlers = false;

    const onHttpClientResponseFinish = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest; response: http.IncomingMessage };
      this._onOutgoingRequestFinish(data.request, data.response);
    }) satisfies ChannelListener;

    const onHttpClientRequestError = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest };
      this._onOutgoingRequestFinish(data.request, undefined);
    }) satisfies ChannelListener;

    const onHttpClientRequestCreated = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest };
      this._onOutgoingRequestCreated(data.request);
    }) satisfies ChannelListener;

    const wrap = <T extends Http | Https>(moduleExports: T): T => {
      if (hasRegisteredHandlers) {
        return moduleExports;
      }

      hasRegisteredHandlers = true;

      subscribe('http.client.response.finish', onHttpClientResponseFinish);

      // When an error happens, we still want to have a breadcrumb
      // In this case, `http.client.response.finish` is not triggered
      subscribe('http.client.request.error', onHttpClientRequestError);

      // NOTE: This channel only exist since Node 22
      // Before that, outgoing requests are not patched
      // and trace headers are not propagated, sadly.
      if (this.getConfig().propagateTraceInOutgoingRequests) {
        subscribe('http.client.request.created', onHttpClientRequestCreated);
      }

      return moduleExports;
    };

    const unwrap = (): void => {
      unsubscribe('http.client.response.finish', onHttpClientResponseFinish);
      unsubscribe('http.client.request.error', onHttpClientRequestError);
      unsubscribe('http.client.request.created', onHttpClientRequestCreated);
    };

    /**
     * You may be wondering why we register these diagnostics-channel listeners
     * in such a convoluted way (as InstrumentationNodeModuleDefinition...)˝,
     * instead of simply subscribing to the events once in here.
     * The reason for this is timing semantics: These functions are called once the http or https module is loaded.
     * If we'd subscribe before that, there seem to be conflicts with the OTEL native instrumentation in some scenarios,
     * especially the "import-on-top" pattern of setting up ESM applications.
     */
    return [
      new InstrumentationNodeModuleDefinition('http', ['*'], wrap, unwrap),
      new InstrumentationNodeModuleDefinition('https', ['*'], wrap, unwrap),
    ];
  }

  /**
   * This is triggered when an outgoing request finishes.
   * It has access to the final request and response objects.
   */
  private _onOutgoingRequestFinish(request: http.ClientRequest, response?: http.IncomingMessage): void {
    DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Handling finished outgoing request');

    const _breadcrumbs = this.getConfig().breadcrumbs;
    const breadCrumbsEnabled = typeof _breadcrumbs === 'undefined' ? true : _breadcrumbs;

    // Note: We cannot rely on the map being set by `_onOutgoingRequestCreated`, because that is not run in Node <22
    const shouldIgnore = this._ignoreOutgoingRequestsMap.get(request) ?? this._shouldIgnoreOutgoingRequest(request);
    this._ignoreOutgoingRequestsMap.set(request, shouldIgnore);

    if (breadCrumbsEnabled && !shouldIgnore) {
      addRequestBreadcrumb(request, response);
    }
  }

  /**
   * This is triggered when an outgoing request is created.
   * It has access to the request object, and can mutate it before the request is sent.
   */
  private _onOutgoingRequestCreated(request: http.ClientRequest): void {
    const shouldIgnore = this._ignoreOutgoingRequestsMap.get(request) ?? this._shouldIgnoreOutgoingRequest(request);
    this._ignoreOutgoingRequestsMap.set(request, shouldIgnore);

    if (shouldIgnore) {
      return;
    }

    addTracePropagationHeadersToOutgoingRequest(request, this._propagationDecisionMap);
  }

  /**
   * Check if the given outgoing request should be ignored.
   */
  private _shouldIgnoreOutgoingRequest(request: http.ClientRequest): boolean {
    if (isTracingSuppressed(context.active())) {
      return true;
    }

    const ignoreOutgoingRequests = this.getConfig().ignoreOutgoingRequests;

    if (!ignoreOutgoingRequests) {
      return false;
    }

    const options = getRequestOptions(request);
    const url = getRequestUrl(request);
    return ignoreOutgoingRequests(url, options);
  }
}
