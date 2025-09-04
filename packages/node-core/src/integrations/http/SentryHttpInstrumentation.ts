import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type * as http from 'node:http';
import type * as https from 'node:https';
import type { Span } from '@opentelemetry/api';
import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { debug, LRUMap, SDK_VERSION } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { getRequestUrl } from '../../utils/getRequestUrl';
import { INSTRUMENTATION_NAME } from './constants';
import { instrumentServer } from './incoming-requests';
import {
  addRequestBreadcrumb,
  addTracePropagationHeadersToOutgoingRequest,
  getRequestOptions,
} from './outgoing-requests';

type Http = typeof http;
type Https = typeof https;

export type SentryHttpInstrumentationOptions = InstrumentationConfig & {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Whether to create spans for requests or not.
   * As of now, creates spans for incoming requests, but not outgoing requests.
   *
   * @default `true`
   */
  spans?: boolean;

  /**
   * Whether to extract the trace ID from the `sentry-trace` header for incoming requests.
   * By default this is done by the HttpInstrumentation, but if that is not added (e.g. because tracing is disabled, ...)
   * then this instrumentation can take over.
   *
   * @deprecated This is always true and the option will be removed in the future.
   *
   * @default `true`
   */
  extractIncomingTraceFromHeader?: boolean;

  /**
   * Whether to propagate Sentry trace headers in outgoing requests.
   * By default this is done by the HttpInstrumentation, but if that is not added (e.g. because tracing is disabled)
   * then this instrumentation can take over.
   *
   * @default `false`
   */
  propagateTraceInOutgoingRequests?: boolean;

  /**
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   * This helps reduce noise in your transactions.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * If true, do not generate spans for incoming requests at all.
   * This is used by Remix to avoid generating spans for incoming requests, as it generates its own spans.
   */
  disableIncomingRequestSpans?: boolean;

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
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   *
   * @param urlPath Contains the URL path and query string (if any) of the incoming request.
   * @param request Contains the {@type IncomingMessage} object of the incoming request.
   */
  ignoreSpansForIncomingRequests?: (urlPath: string, request: http.IncomingMessage) => boolean;

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   * This can be useful for long running requests where the body is not needed and we want to avoid capturing it.
   *
   * @param url Contains the entire URL, including query string (if any), protocol, host, etc. of the incoming request.
   * @param request Contains the {@type RequestOptions} object used to make the incoming request.
   */
  ignoreIncomingRequestBody?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  incomingRequestSpanHook?: (span: Span, request: http.IncomingMessage, response: http.ServerResponse) => void;

  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   *
   * Available options:
   * - 'none': No request bodies will be attached
   * - 'small': Request bodies up to 1,000 bytes will be attached
   * - 'medium': Request bodies up to 10,000 bytes will be attached (default)
   * - 'always': Request bodies will always be attached
   *
   * Note that even with 'always' setting, bodies exceeding 1MB will never be attached
   * for performance and security reasons.
   *
   * @default 'medium'
   */
  maxIncomingRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests to track the health and crash-free rate of your releases in Sentry.
   * Read more about Release Health: https://docs.sentry.io/product/releases/health/
   *
   * Defaults to `true`.
   */
  trackIncomingRequestsAsSessions?: boolean;

  /**
   * @deprecated This is deprecated in favor of `incomingRequestSpanHook`.
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
   * Number of milliseconds until sessions tracked with `trackIncomingRequestsAsSessions` will be flushed as a session aggregate.
   *
   * Defaults to `60000` (60s).
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

    const spansEnabled = this.getConfig().spans ?? true;

    const onHttpServerRequestStart = ((_data: unknown) => {
      const data = _data as { server: http.Server };
      instrumentServer(data.server, {
        // eslint-disable-next-line deprecation/deprecation
        instrumentation: this.getConfig().instrumentation,
        ignoreIncomingRequestBody: this.getConfig().ignoreIncomingRequestBody,
        ignoreSpansForIncomingRequests: this.getConfig().ignoreSpansForIncomingRequests,
        incomingRequestSpanHook: this.getConfig().incomingRequestSpanHook,
        maxIncomingRequestBodySize: this.getConfig().maxIncomingRequestBodySize,
        trackIncomingRequestsAsSessions: this.getConfig().trackIncomingRequestsAsSessions,
        sessionFlushingDelayMS: this.getConfig().sessionFlushingDelayMS ?? 60_000,
        ignoreStaticAssets: this.getConfig().ignoreStaticAssets,
        spans: spansEnabled && !this.getConfig().disableIncomingRequestSpans,
      });
    }) satisfies ChannelListener;

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

      subscribe('http.server.request.start', onHttpServerRequestStart);
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
      unsubscribe('http.server.request.start', onHttpServerRequestStart);
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
