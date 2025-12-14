import type { ChannelListener } from 'node:diagnostics_channel';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { errorMonitor } from 'node:events';
import type * as http from 'node:http';
import type * as https from 'node:https';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import {
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_NETWORK_TRANSPORT,
  ATTR_URL_FULL,
  ATTR_USER_AGENT_ORIGINAL,
  SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH,
  SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED,
} from '@opentelemetry/semantic-conventions';
import type { Span, SpanAttributes, SpanStatus } from '@sentry/core';
import {
  debug,
  getHttpSpanDetailsFromUrlObject,
  getSpanStatusFromHttpCode,
  LRUMap,
  parseStringToURLObject,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  startInactiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { INSTRUMENTATION_NAME } from './constants';
import {
  addRequestBreadcrumb,
  addTracePropagationHeadersToOutgoingRequest,
  getRequestOptions,
} from './outgoing-requests';

type Http = typeof http;
type Https = typeof https;
type IncomingHttpHeaders = http.IncomingHttpHeaders;
type OutgoingHttpHeaders = http.OutgoingHttpHeaders;

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
   * This controls whether the instrumentation subscribes to the `http.client.request.start` channel.
   * If enabled, spans will only be created if the `spans` option is also enabled (default: true).
   *
   * This is a feature flag that should be enabled by SDKs when the runtime supports it (Node 22+).
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

  // All options below do not do anything anymore in this instrumentation, and will be removed in the future.
  // They are only kept here for backwards compatibility - the respective functionality is now handled by the httpServerIntegration/httpServerSpansIntegration.

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

    const onHttpClientRequestStart = ((_data: unknown) => {
      const data = _data as { request: http.ClientRequest };
      this._onOutgoingRequestStart(data.request);
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

      if (this.getConfig().createSpansForOutgoingRequests) {
        subscribe('http.client.request.start', onHttpClientRequestStart);
      }
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
      unsubscribe('http.client.request.start', onHttpClientRequestStart);
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
   * This is triggered when an outgoing request starts.
   * It has access to the request object, and can mutate it before the request is sent.
   */
  private _onOutgoingRequestStart(request: http.ClientRequest): void {
    DEBUG_BUILD && debug.log(INSTRUMENTATION_NAME, 'Handling started outgoing request');

    const _spans = this.getConfig().spans;
    const spansEnabled = typeof _spans === 'undefined' ? true : _spans;

    const shouldIgnore = this._ignoreOutgoingRequestsMap.get(request) ?? this._shouldIgnoreOutgoingRequest(request);
    this._ignoreOutgoingRequestsMap.set(request, shouldIgnore);

    if (spansEnabled && !shouldIgnore) {
      this._startSpanForOutgoingRequest(request);
    }
  }

  /**
   * Start a span for an outgoing request.
   * The span wraps the callback of the request, and ends when the response is finished.
   */
  private _startSpanForOutgoingRequest(request: http.ClientRequest): void {
    // We monkey-patch `req.once('response'), which is used to trigger the callback of the request
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    const originalOnce = request.once;

    const [name, attributes] = _getOutgoingRequestSpanData(request);

    const span = startInactiveSpan({
      name,
      attributes,
      onlyIfParent: true,
    });

    const newOnce = new Proxy(originalOnce, {
      apply(target, thisArg, args: Parameters<typeof originalOnce>) {
        const [event] = args;
        if (event !== 'response') {
          return target.apply(thisArg, args);
        }

        const parentContext = context.active();
        const requestContext = trace.setSpan(parentContext, span);

        context.with(requestContext, () => {
          return target.apply(thisArg, args);
        });
      },
    });

    // eslint-disable-next-line deprecation/deprecation
    request.once = newOnce;

    /**
     * Determines if the request has errored or the response has ended/errored.
     */
    let responseFinished = false;

    const endSpan = (status: SpanStatus): void => {
      if (responseFinished) {
        return;
      }
      responseFinished = true;

      span.setStatus(status);
      span.end();
    };

    request.prependListener('response', response => {
      if (request.listenerCount('response') <= 1) {
        response.resume();
      }

      context.bind(context.active(), response);

      const additionalAttributes = _getOutgoingRequestEndedSpanData(response);
      span.setAttributes(additionalAttributes);

      const endHandler = (forceError: boolean = false): void => {
        this._diag.debug('outgoingRequest on end()');

        const status =
          // eslint-disable-next-line deprecation/deprecation
          forceError || typeof response.statusCode !== 'number' || (response.aborted && !response.complete)
            ? { code: SpanStatusCode.ERROR }
            : getSpanStatusFromHttpCode(response.statusCode);

        endSpan(status);
      };

      response.on('end', () => {
        endHandler();
      });
      response.on(errorMonitor, error => {
        this._diag.debug('outgoingRequest on response error()', error);
        endHandler(true);
      });
    });

    // Fallback if proper response end handling above fails
    request.on('close', () => {
      endSpan({ code: SpanStatusCode.UNSET });
    });
    request.on(errorMonitor, error => {
      this._diag.debug('outgoingRequest on request error()', error);
      endSpan({ code: SpanStatusCode.ERROR });
    });
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

function _getOutgoingRequestSpanData(request: http.ClientRequest): [string, SpanAttributes] {
  const url = getRequestUrl(request);

  const [name, attributes] = getHttpSpanDetailsFromUrlObject(
    parseStringToURLObject(url),
    'client',
    'auto.http.otel.http',
    request,
  );

  const userAgent = request.getHeader('user-agent');

  return [
    name,
    {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      'otel.kind': 'CLIENT',
      [ATTR_USER_AGENT_ORIGINAL]: userAgent,
      [ATTR_URL_FULL]: url,
      'http.url': url,
      'http.method': request.method,
      'http.target': request.path || '/',
      'net.peer.name': request.host,
      'http.host': request.getHeader('host'),
      ...attributes,
    },
  ];
}

function getRequestUrl(request: http.ClientRequest): string {
  const hostname = request.getHeader('host') || request.host;
  const protocol = request.protocol;
  const path = request.path;

  return `${protocol}//${hostname}${path}`;
}

function _getOutgoingRequestEndedSpanData(response: http.IncomingMessage): SpanAttributes {
  const { statusCode, statusMessage, httpVersion, socket } = response;

  const transport = httpVersion.toUpperCase() !== 'QUIC' ? 'ip_tcp' : 'ip_udp';

  const additionalAttributes: SpanAttributes = {
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
    [ATTR_NETWORK_PROTOCOL_VERSION]: httpVersion,
    'http.flavor': httpVersion,
    [ATTR_NETWORK_TRANSPORT]: transport,
    'net.transport': transport,
    ['http.status_text']: statusMessage?.toUpperCase(),
    'http.status_code': statusCode,
    ...getResponseContentLengthAttributes(response),
  };

  if (socket) {
    const { remoteAddress, remotePort } = socket;

    additionalAttributes[ATTR_NETWORK_PEER_ADDRESS] = remoteAddress;
    additionalAttributes[ATTR_NETWORK_PEER_PORT] = remotePort;
    additionalAttributes['net.peer.ip'] = remoteAddress;
    additionalAttributes['net.peer.port'] = remotePort;
  }

  return additionalAttributes;
}

function getResponseContentLengthAttributes(response: http.IncomingMessage): SpanAttributes {
  const length = getContentLength(response.headers);
  if (length == null) {
    return {};
  }

  if (isCompressed(response.headers)) {
    // eslint-disable-next-line deprecation/deprecation
    return { [SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH]: length };
  } else {
    // eslint-disable-next-line deprecation/deprecation
    return { [SEMATTRS_HTTP_RESPONSE_CONTENT_LENGTH_UNCOMPRESSED]: length };
  }
}

function getContentLength(headers: http.OutgoingHttpHeaders): number | undefined {
  const contentLengthHeader = headers['content-length'];
  if (typeof contentLengthHeader !== 'string') {
    return contentLengthHeader;
  }

  const contentLength = parseInt(contentLengthHeader, 10);
  if (isNaN(contentLength)) {
    return undefined;
  }

  return contentLength;
}

function isCompressed(headers: OutgoingHttpHeaders | IncomingHttpHeaders): boolean {
  const encoding = headers['content-encoding'];

  return !!encoding && encoding !== 'identity';
}
