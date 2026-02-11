import type {
  Client,
  HandlerDataXhr,
  RequestHookInfo,
  ResponseHookInfo,
  SentryWrappedXMLHttpRequest,
  Span,
} from '@sentry/core';
import {
  addFetchEndInstrumentationHandler,
  addFetchInstrumentationHandler,
  getActiveSpan,
  getClient,
  getLocationHref,
  getTraceData,
  hasSpansEnabled,
  instrumentFetchRequest,
  parseUrl,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  setHttpStatus,
  spanToJSON,
  startInactiveSpan,
  stringMatchesSomePattern,
  stripDataUrlContent,
  stripUrlQueryAndFragment,
} from '@sentry/core';
import type { XhrHint } from '@sentry-internal/browser-utils';
import {
  addPerformanceInstrumentationHandler,
  addXhrInstrumentationHandler,
  parseXhrResponseHeaders,
  resourceTimingToSpanAttributes,
  SENTRY_XHR_DATA_KEY,
} from '@sentry-internal/browser-utils';
import type { BrowserClient } from '../client';
import { baggageHeaderHasSentryValues, createHeadersSafely, getFullURL, isPerformanceResourceTiming } from './utils';

/** Options for Request Instrumentation */
export interface RequestInstrumentationOptions {
  /**
   * List of strings and/or Regular Expressions used to determine which outgoing requests will have `sentry-trace` and `baggage`
   * headers attached.
   *
   * **Default:** If this option is not provided, tracing headers will be attached to all outgoing requests.
   * If you are using a browser SDK, by default, tracing headers will only be attached to outgoing requests to the same origin.
   *
   * **Disclaimer:** Carelessly setting this option in browser environments may result into CORS errors!
   * Only attach tracing headers to requests to the same origin, or to requests to services you can control CORS headers of.
   * Cross-origin requests, meaning requests to a different domain, for example a request to `https://api.example.com/` while you're on `https://example.com/`, take special care.
   * If you are attaching headers to cross-origin requests, make sure the backend handling the request returns a `"Access-Control-Allow-Headers: sentry-trace, baggage"` header to ensure your requests aren't blocked.
   *
   * If you provide a `tracePropagationTargets` array, the entries you provide will be matched against the entire URL of the outgoing request.
   * If you are using a browser SDK, the entries will also be matched against the pathname of the outgoing requests.
   * This is so you can have matchers for relative requests, for example, `/^\/api/` if you want to trace requests to your `/api` routes on the same domain.
   *
   * If any of the two match any of the provided values, tracing headers will be attached to the outgoing request.
   * Both, the string values, and the RegExes you provide in the array will match if they partially match the URL or pathname.
   *
   * Examples:
   * - `tracePropagationTargets: [/^\/api/]` and request to `https://same-origin.com/api/posts`:
   *   - Tracing headers will be attached because the request is sent to the same origin and the regex matches the pathname "/api/posts".
   * - `tracePropagationTargets: [/^\/api/]` and request to `https://different-origin.com/api/posts`:
   *   - Tracing headers will not be attached because the pathname will only be compared when the request target lives on the same origin.
   * - `tracePropagationTargets: [/^\/api/, 'https://external-api.com']` and request to `https://external-api.com/v1/data`:
   *   - Tracing headers will be attached because the request URL matches the string `'https://external-api.com'`.
   */
  tracePropagationTargets?: Array<string | RegExp>;

  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Default: true
   */
  traceFetch: boolean;

  /**
   * Flag to disable patching all together for xhr requests.
   *
   * Default: true
   */
  traceXHR: boolean;

  /**
   * Flag to disable tracking of long-lived streams, like server-sent events (SSE) via fetch.
   * Do not enable this in case you have live streams or very long running streams.
   *
   * Disabled by default since it can lead to issues with streams using the `cancel()` api
   * (https://github.com/getsentry/sentry-javascript/issues/13950)
   *
   * Default: false
   */
  trackFetchStreamPerformance: boolean;

  /**
   * If true, Sentry will capture http timings and add them to the corresponding http spans.
   *
   * Default: true
   */
  enableHTTPTimings: boolean;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * Default: (url: string) => true
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;

  /**
   * Is called when spans are started for outgoing requests.
   */
  onRequestSpanStart?(span: Span, requestInformation: RequestHookInfo): void;

  /**
   * Is called when spans end for outgoing requests, providing access to response headers.
   */
  onRequestSpanEnd?(span: Span, responseInformation: ResponseHookInfo): void;
}

const responseToSpanId = new WeakMap<object, string>();
const spanIdToEndTimestamp = new Map<string, number>();

export const defaultRequestInstrumentationOptions: RequestInstrumentationOptions = {
  traceFetch: true,
  traceXHR: true,
  enableHTTPTimings: true,
  trackFetchStreamPerformance: false,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(client: Client, _options?: Partial<RequestInstrumentationOptions>): void {
  const {
    traceFetch,
    traceXHR,
    trackFetchStreamPerformance,
    shouldCreateSpanForRequest,
    enableHTTPTimings,
    tracePropagationTargets,
    onRequestSpanStart,
    onRequestSpanEnd,
  } = {
    ...defaultRequestInstrumentationOptions,
    ..._options,
  };

  const shouldCreateSpan =
    typeof shouldCreateSpanForRequest === 'function' ? shouldCreateSpanForRequest : (_: string) => true;

  const shouldAttachHeadersWithTargets = (url: string): boolean => shouldAttachHeaders(url, tracePropagationTargets);

  const spans: Record<string, Span> = {};

  const propagateTraceparent = (client as BrowserClient).getOptions().propagateTraceparent;

  if (traceFetch) {
    // Keeping track of http requests, whose body payloads resolved later than the initial resolved request
    // e.g. streaming using server sent events (SSE)
    client.addEventProcessor(event => {
      if (event.type === 'transaction' && event.spans) {
        event.spans.forEach(span => {
          if (span.op === 'http.client') {
            const updatedTimestamp = spanIdToEndTimestamp.get(span.span_id);
            if (updatedTimestamp) {
              span.timestamp = updatedTimestamp / 1000;
              spanIdToEndTimestamp.delete(span.span_id);
            }
          }
        });
      }
      return event;
    });

    if (trackFetchStreamPerformance) {
      addFetchEndInstrumentationHandler(handlerData => {
        if (handlerData.response) {
          const span = responseToSpanId.get(handlerData.response);
          if (span && handlerData.endTimestamp) {
            spanIdToEndTimestamp.set(span, handlerData.endTimestamp);
          }
        }
      });
    }

    addFetchInstrumentationHandler(handlerData => {
      const createdSpan = instrumentFetchRequest(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans, {
        propagateTraceparent,
        onRequestSpanEnd,
      });

      if (handlerData.response && handlerData.fetchData.__span) {
        responseToSpanId.set(handlerData.response, handlerData.fetchData.__span);
      }

      // We cannot use `window.location` in the generic fetch instrumentation,
      // but we need it for reliable `server.address` attribute.
      // so we extend this in here
      if (createdSpan) {
        const fullUrl = getFullURL(handlerData.fetchData.url);
        const host = fullUrl ? parseUrl(fullUrl).host : undefined;
        createdSpan.setAttributes({
          'http.url': fullUrl ? stripDataUrlContent(fullUrl) : undefined,
          'server.address': host,
        });

        if (enableHTTPTimings) {
          addHTTPTimings(createdSpan);
        }

        onRequestSpanStart?.(createdSpan, { headers: handlerData.headers });
      }
    });
  }

  if (traceXHR) {
    addXhrInstrumentationHandler(handlerData => {
      const createdSpan = xhrCallback(
        handlerData,
        shouldCreateSpan,
        shouldAttachHeadersWithTargets,
        spans,
        propagateTraceparent,
        onRequestSpanEnd,
      );

      if (createdSpan) {
        if (enableHTTPTimings) {
          addHTTPTimings(createdSpan);
        }

        onRequestSpanStart?.(createdSpan, {
          headers: createHeadersSafely(handlerData.xhr.__sentry_xhr_v3__?.request_headers),
        });
      }
    });
  }
}

/**
 * Creates a temporary observer to listen to the next fetch/xhr resourcing timings,
 * so that when timings hit their per-browser limit they don't need to be removed.
 *
 * @param span A span that has yet to be finished, must contain `url` on data.
 */
function addHTTPTimings(span: Span): void {
  const { url } = spanToJSON(span).data;

  if (!url || typeof url !== 'string') {
    return;
  }

  const cleanup = addPerformanceInstrumentationHandler('resource', ({ entries }) => {
    entries.forEach(entry => {
      if (isPerformanceResourceTiming(entry) && entry.name.endsWith(url)) {
        span.setAttributes(resourceTimingToSpanAttributes(entry));
        // In the next tick, clean this handler up
        // We have to wait here because otherwise this cleans itself up before it is fully done
        setTimeout(cleanup);
      }
    });
  });
}

/**
 * A function that determines whether to attach tracing headers to a request.
 * We only export this function for testing purposes.
 */
export function shouldAttachHeaders(
  targetUrl: string,
  tracePropagationTargets: (string | RegExp)[] | undefined,
): boolean {
  // window.location.href not being defined is an edge case in the browser but we need to handle it.
  // Potentially dangerous situations where it may not be defined: Browser Extensions, Web Workers, patching of the location obj
  const href = getLocationHref();

  if (!href) {
    // If there is no window.location.origin, we default to only attaching tracing headers to relative requests, i.e. ones that start with `/`
    // BIG DISCLAIMER: Users can call URLs with a double slash (fetch("//example.com/api")), this is a shorthand for "send to the same protocol",
    // so we need a to exclude those requests, because they might be cross origin.
    const isRelativeSameOriginRequest = !!targetUrl.match(/^\/(?!\/)/);
    if (!tracePropagationTargets) {
      return isRelativeSameOriginRequest;
    } else {
      return stringMatchesSomePattern(targetUrl, tracePropagationTargets);
    }
  } else {
    let resolvedUrl;
    let currentOrigin;

    // URL parsing may fail, we default to not attaching trace headers in that case.
    try {
      resolvedUrl = new URL(targetUrl, href);
      currentOrigin = new URL(href).origin;
    } catch {
      return false;
    }

    const isSameOriginRequest = resolvedUrl.origin === currentOrigin;
    if (!tracePropagationTargets) {
      return isSameOriginRequest;
    } else {
      return (
        stringMatchesSomePattern(resolvedUrl.toString(), tracePropagationTargets) ||
        (isSameOriginRequest && stringMatchesSomePattern(resolvedUrl.pathname, tracePropagationTargets))
      );
    }
  }
}

/**
 * Create and track xhr request spans
 *
 * @returns Span if a span was created, otherwise void.
 */
function xhrCallback(
  handlerData: HandlerDataXhr,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
  propagateTraceparent?: boolean,
  onRequestSpanEnd?: RequestInstrumentationOptions['onRequestSpanEnd'],
): Span | undefined {
  const xhr = handlerData.xhr;
  const sentryXhrData = xhr?.[SENTRY_XHR_DATA_KEY];

  if (!xhr || xhr.__sentry_own_request__ || !sentryXhrData) {
    return undefined;
  }

  const { url, method } = sentryXhrData;

  const shouldCreateSpanResult = hasSpansEnabled() && shouldCreateSpan(url);

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = xhr.__sentry_xhr_span_id__;
    if (!spanId) return;

    const span = spans[spanId];
    if (span && sentryXhrData.status_code !== undefined) {
      setHttpStatus(span, sentryXhrData.status_code);
      span.end();

      onRequestSpanEnd?.(span, {
        headers: createHeadersSafely(parseXhrResponseHeaders(xhr as XMLHttpRequest & SentryWrappedXMLHttpRequest)),
        error: handlerData.error,
      });

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const fullUrl = getFullURL(url);
  const parsedUrl = fullUrl ? parseUrl(fullUrl) : parseUrl(url);

  const urlForSpanName = stripDataUrlContent(stripUrlQueryAndFragment(url));

  const hasParent = !!getActiveSpan();

  const span =
    shouldCreateSpanResult && hasParent
      ? startInactiveSpan({
          name: `${method} ${urlForSpanName}`,
          attributes: {
            url: stripDataUrlContent(url),
            type: 'xhr',
            'http.method': method,
            'http.url': fullUrl ? stripDataUrlContent(fullUrl) : undefined,
            'server.address': parsedUrl?.host,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
            ...(parsedUrl?.search && { 'http.query': parsedUrl?.search }),
            ...(parsedUrl?.hash && { 'http.fragment': parsedUrl?.hash }),
          },
        })
      : new SentryNonRecordingSpan();

  xhr.__sentry_xhr_span_id__ = span.spanContext().spanId;
  spans[xhr.__sentry_xhr_span_id__] = span;

  if (shouldAttachHeaders(url)) {
    addTracingHeadersToXhrRequest(
      xhr,
      // If performance is disabled (TWP) or there's no active root span (pageload/navigation/interaction),
      // we do not want to use the span as base for the trace headers,
      // which means that the headers will be generated from the scope and the sampling decision is deferred
      hasSpansEnabled() && hasParent ? span : undefined,
      propagateTraceparent,
    );
  }

  const client = getClient();
  if (client) {
    client.emit('beforeOutgoingRequestSpan', span, handlerData as XhrHint);
  }

  return span;
}

function addTracingHeadersToXhrRequest(
  xhr: SentryWrappedXMLHttpRequest,
  span?: Span,
  propagateTraceparent?: boolean,
): void {
  const { 'sentry-trace': sentryTrace, baggage, traceparent } = getTraceData({ span, propagateTraceparent });

  if (sentryTrace) {
    setHeaderOnXhr(xhr, sentryTrace, baggage, traceparent);
  }
}

function setHeaderOnXhr(
  xhr: SentryWrappedXMLHttpRequest,
  sentryTraceHeader: string,
  sentryBaggageHeader: string | undefined,
  traceparentHeader: string | undefined,
): void {
  const originalHeaders = xhr.__sentry_xhr_v3__?.request_headers;

  if (originalHeaders?.['sentry-trace'] || !xhr.setRequestHeader) {
    // bail if a sentry-trace header is already set
    return;
  }

  try {
    xhr.setRequestHeader('sentry-trace', sentryTraceHeader);

    if (traceparentHeader && !originalHeaders?.['traceparent']) {
      xhr.setRequestHeader('traceparent', traceparentHeader);
    }

    if (sentryBaggageHeader) {
      // only add our headers if
      // - no pre-existing baggage header exists
      // - or it is set and doesn't yet contain sentry values
      const originalBaggageHeader = originalHeaders?.['baggage'];
      if (!originalBaggageHeader || !baggageHeaderHasSentryValues(originalBaggageHeader)) {
        // From MDN: "If this method is called several times with the same header, the values are merged into one single request header."
        // We can therefore simply set a baggage header without checking what was there before
        // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/setRequestHeader
        xhr.setRequestHeader('baggage', sentryBaggageHeader);
      }
    }
  } catch {
    // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
  }
}
