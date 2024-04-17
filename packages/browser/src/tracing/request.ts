import {
  SENTRY_XHR_DATA_KEY,
  addPerformanceInstrumentationHandler,
  addXhrInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  hasTracingEnabled,
  instrumentFetchRequest,
  setHttpStatus,
  spanToJSON,
  spanToTraceHeader,
  startInactiveSpan,
} from '@sentry/core';
import type { Client, HandlerDataXhr, SentryWrappedXMLHttpRequest, Span } from '@sentry/types';
import {
  BAGGAGE_HEADER_NAME,
  addFetchInstrumentationHandler,
  browserPerformanceTimeOrigin,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  parseUrl,
  stringMatchesSomePattern,
} from '@sentry/utils';
import { WINDOW } from '../helpers';

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
}

export const defaultRequestInstrumentationOptions: RequestInstrumentationOptions = {
  traceFetch: true,
  traceXHR: true,
  enableHTTPTimings: true,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  const { traceFetch, traceXHR, shouldCreateSpanForRequest, enableHTTPTimings, tracePropagationTargets } = {
    traceFetch: defaultRequestInstrumentationOptions.traceFetch,
    traceXHR: defaultRequestInstrumentationOptions.traceXHR,
    ..._options,
  };

  const shouldCreateSpan =
    typeof shouldCreateSpanForRequest === 'function' ? shouldCreateSpanForRequest : (_: string) => true;

  const shouldAttachHeadersWithTargets = (url: string): boolean => shouldAttachHeaders(url, tracePropagationTargets);

  const spans: Record<string, Span> = {};

  if (traceFetch) {
    addFetchInstrumentationHandler(handlerData => {
      const createdSpan = instrumentFetchRequest(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
      // We cannot use `window.location` in the generic fetch instrumentation,
      // but we need it for reliable `server.address` attribute.
      // so we extend this in here
      if (createdSpan) {
        const fullUrl = getFullURL(handlerData.fetchData.url);
        const host = fullUrl ? parseUrl(fullUrl).host : undefined;
        createdSpan.setAttributes({
          'http.url': fullUrl,
          'server.address': host,
        });
      }

      if (enableHTTPTimings && createdSpan) {
        addHTTPTimings(createdSpan);
      }
    });
  }

  if (traceXHR) {
    addXhrInstrumentationHandler(handlerData => {
      const createdSpan = xhrCallback(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
      if (enableHTTPTimings && createdSpan) {
        addHTTPTimings(createdSpan);
      }
    });
  }
}

function isPerformanceResourceTiming(entry: PerformanceEntry): entry is PerformanceResourceTiming {
  return (
    entry.entryType === 'resource' &&
    'initiatorType' in entry &&
    typeof (entry as PerformanceResourceTiming).nextHopProtocol === 'string' &&
    (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest')
  );
}

/**
 * Creates a temporary observer to listen to the next fetch/xhr resourcing timings,
 * so that when timings hit their per-browser limit they don't need to be removed.
 *
 * @param span A span that has yet to be finished, must contain `url` on data.
 */
function addHTTPTimings(span: Span): void {
  const { url } = spanToJSON(span).data || {};

  if (!url || typeof url !== 'string') {
    return;
  }

  const cleanup = addPerformanceInstrumentationHandler('resource', ({ entries }) => {
    entries.forEach(entry => {
      if (isPerformanceResourceTiming(entry) && entry.name.endsWith(url)) {
        const spanData = resourceTimingEntryToSpanData(entry);
        spanData.forEach(data => span.setAttribute(...data));
        // In the next tick, clean this handler up
        // We have to wait here because otherwise this cleans itself up before it is fully done
        setTimeout(cleanup);
      }
    });
  });
}

/**
 * Converts ALPN protocol ids to name and version.
 *
 * (https://www.iana.org/assignments/tls-extensiontype-values/tls-extensiontype-values.xhtml#alpn-protocol-ids)
 * @param nextHopProtocol PerformanceResourceTiming.nextHopProtocol
 */
export function extractNetworkProtocol(nextHopProtocol: string): { name: string; version: string } {
  let name = 'unknown';
  let version = 'unknown';
  let _name = '';
  for (const char of nextHopProtocol) {
    // http/1.1 etc.
    if (char === '/') {
      [name, version] = nextHopProtocol.split('/');
      break;
    }
    // h2, h3 etc.
    if (!isNaN(Number(char))) {
      name = _name === 'h' ? 'http' : _name;
      version = nextHopProtocol.split(_name)[1];
      break;
    }
    _name += char;
  }
  if (_name === nextHopProtocol) {
    // webrtc, ftp, etc.
    name = _name;
  }
  return { name, version };
}

function getAbsoluteTime(time: number = 0): number {
  return ((browserPerformanceTimeOrigin || performance.timeOrigin) + time) / 1000;
}

function resourceTimingEntryToSpanData(resourceTiming: PerformanceResourceTiming): [string, string | number][] {
  const { name, version } = extractNetworkProtocol(resourceTiming.nextHopProtocol);

  const timingSpanData: [string, string | number][] = [];

  timingSpanData.push(['network.protocol.version', version], ['network.protocol.name', name]);

  if (!browserPerformanceTimeOrigin) {
    return timingSpanData;
  }
  return [
    ...timingSpanData,
    ['http.request.redirect_start', getAbsoluteTime(resourceTiming.redirectStart)],
    ['http.request.fetch_start', getAbsoluteTime(resourceTiming.fetchStart)],
    ['http.request.domain_lookup_start', getAbsoluteTime(resourceTiming.domainLookupStart)],
    ['http.request.domain_lookup_end', getAbsoluteTime(resourceTiming.domainLookupEnd)],
    ['http.request.connect_start', getAbsoluteTime(resourceTiming.connectStart)],
    ['http.request.secure_connection_start', getAbsoluteTime(resourceTiming.secureConnectionStart)],
    ['http.request.connection_end', getAbsoluteTime(resourceTiming.connectEnd)],
    ['http.request.request_start', getAbsoluteTime(resourceTiming.requestStart)],
    ['http.request.response_start', getAbsoluteTime(resourceTiming.responseStart)],
    ['http.request.response_end', getAbsoluteTime(resourceTiming.responseEnd)],
  ];
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
  const href: string | undefined = WINDOW.location && WINDOW.location.href;

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
    } catch (e) {
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
export function xhrCallback(
  handlerData: HandlerDataXhr,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): Span | undefined {
  const xhr = handlerData.xhr;
  const sentryXhrData = xhr && xhr[SENTRY_XHR_DATA_KEY];

  if (!xhr || xhr.__sentry_own_request__ || !sentryXhrData) {
    return undefined;
  }

  const shouldCreateSpanResult = hasTracingEnabled() && shouldCreateSpan(sentryXhrData.url);

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = xhr.__sentry_xhr_span_id__;
    if (!spanId) return;

    const span = spans[spanId];
    if (span && sentryXhrData.status_code !== undefined) {
      setHttpStatus(span, sentryXhrData.status_code);
      span.end();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const hasParent = !!getActiveSpan();

  const fullUrl = getFullURL(sentryXhrData.url);
  const host = fullUrl ? parseUrl(fullUrl).host : undefined;

  const span =
    shouldCreateSpanResult && hasParent
      ? startInactiveSpan({
          name: `${sentryXhrData.method} ${sentryXhrData.url}`,
          attributes: {
            type: 'xhr',
            'http.method': sentryXhrData.method,
            'http.url': fullUrl,
            url: sentryXhrData.url,
            'server.address': host,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
          },
        })
      : new SentryNonRecordingSpan();

  xhr.__sentry_xhr_span_id__ = span.spanContext().spanId;
  spans[xhr.__sentry_xhr_span_id__] = span;

  const client = getClient();

  if (xhr.setRequestHeader && shouldAttachHeaders(sentryXhrData.url) && client) {
    addTracingHeadersToXhrRequest(
      xhr,
      client,
      // In the following cases, we do not want to use the span as base for the trace headers,
      // which means that the headers will be generated from the scope:
      // - If tracing is disabled (TWP)
      // - If the span has no parent span - which means we ran into `onlyIfParent` check
      hasTracingEnabled() && hasParent ? span : undefined,
    );
  }

  return span;
}

function addTracingHeadersToXhrRequest(xhr: SentryWrappedXMLHttpRequest, client: Client, span?: Span): void {
  const scope = getCurrentScope();
  const isolationScope = getIsolationScope();
  const { traceId, spanId, sampled, dsc } = {
    ...isolationScope.getPropagationContext(),
    ...scope.getPropagationContext(),
  };

  const sentryTraceHeader =
    span && hasTracingEnabled() ? spanToTraceHeader(span) : generateSentryTraceHeader(traceId, spanId, sampled);

  const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(
    dsc || (span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromClient(traceId, client)),
  );

  setHeaderOnXhr(xhr, sentryTraceHeader, sentryBaggageHeader);
}

function setHeaderOnXhr(
  xhr: SentryWrappedXMLHttpRequest,
  sentryTraceHeader: string,
  sentryBaggageHeader: string | undefined,
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    xhr.setRequestHeader!('sentry-trace', sentryTraceHeader);
    if (sentryBaggageHeader) {
      // From MDN: "If this method is called several times with the same header, the values are merged into one single request header."
      // We can therefore simply set a baggage header without checking what was there before
      // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/setRequestHeader
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      xhr.setRequestHeader!(BAGGAGE_HEADER_NAME, sentryBaggageHeader);
    }
  } catch (_) {
    // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
  }
}

function getFullURL(url: string): string | undefined {
  try {
    // By adding a base URL to new URL(), this will also work for relative urls
    // If `url` is a full URL, the base URL is ignored anyhow
    const parsed = new URL(url, WINDOW.location.origin);
    return parsed.href;
  } catch {
    return undefined;
  }
}
