/* eslint-disable max-lines */
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  hasTracingEnabled,
  setHttpStatus,
  spanToJSON,
  spanToTraceHeader,
  startInactiveSpan,
} from '@sentry/core';
import type { HandlerDataXhr, SentryWrappedXMLHttpRequest, Span } from '@sentry/types';
import {
  BAGGAGE_HEADER_NAME,
  SENTRY_XHR_DATA_KEY,
  addFetchInstrumentationHandler,
  addXhrInstrumentationHandler,
  browserPerformanceTimeOrigin,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  stringMatchesSomePattern,
} from '@sentry/utils';

import { instrumentFetchRequest } from '../common/fetch';
import { addPerformanceInstrumentationHandler } from './instrument';

export const DEFAULT_TRACE_PROPAGATION_TARGETS = ['localhost', /^\/(?!\/)/];

/** Options for Request Instrumentation */
export interface RequestInstrumentationOptions {
  /**
   * @deprecated Will be removed in v8.
   * Use `shouldCreateSpanForRequest` to control span creation and `tracePropagationTargets` to control
   * trace header attachment.
   */
  tracingOrigins: Array<string | RegExp>;

  /**
   * List of strings and/or regexes used to determine which outgoing requests will have `sentry-trace` and `baggage`
   * headers attached.
   *
   * @deprecated Use the top-level `tracePropagationTargets` option in `Sentry.init` instead.
   * This option will be removed in v8.
   *
   * Default: ['localhost', /^\//] @see {DEFAULT_TRACE_PROPAGATION_TARGETS}
   */
  tracePropagationTargets: Array<string | RegExp>;

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
  // TODO (v8): Remove this property
  tracingOrigins: DEFAULT_TRACE_PROPAGATION_TARGETS,
  tracePropagationTargets: DEFAULT_TRACE_PROPAGATION_TARGETS,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  const {
    traceFetch,
    traceXHR,
    // eslint-disable-next-line deprecation/deprecation
    tracePropagationTargets,
    // eslint-disable-next-line deprecation/deprecation
    tracingOrigins,
    shouldCreateSpanForRequest,
    enableHTTPTimings,
  } = {
    traceFetch: defaultRequestInstrumentationOptions.traceFetch,
    traceXHR: defaultRequestInstrumentationOptions.traceXHR,
    ..._options,
  };

  const shouldCreateSpan =
    typeof shouldCreateSpanForRequest === 'function' ? shouldCreateSpanForRequest : (_: string) => true;

  // TODO(v8) Remove tracingOrigins here
  // The only reason we're passing it in here is because this instrumentOutgoingRequests function is publicly exported
  // and we don't want to break the API. We can remove it in v8.
  const shouldAttachHeadersWithTargets = (url: string): boolean =>
    shouldAttachHeaders(url, tracePropagationTargets || tracingOrigins);

  const spans: Record<string, Span> = {};

  if (traceFetch) {
    addFetchInstrumentationHandler(handlerData => {
      const createdSpan = instrumentFetchRequest(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
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
 * This was extracted from `instrumentOutgoingRequests` to make it easier to test shouldAttachHeaders.
 * We only export this fuction for testing purposes.
 */
export function shouldAttachHeaders(url: string, tracePropagationTargets: (string | RegExp)[] | undefined): boolean {
  return stringMatchesSomePattern(url, tracePropagationTargets || DEFAULT_TRACE_PROPAGATION_TARGETS);
}

/**
 * Create and track xhr request spans
 *
 * @returns Span if a span was created, otherwise void.
 */
// eslint-disable-next-line complexity
export function xhrCallback(
  handlerData: HandlerDataXhr,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): Span | undefined {
  const xhr = handlerData.xhr;
  const sentryXhrData = xhr && xhr[SENTRY_XHR_DATA_KEY];

  if (!hasTracingEnabled() || !xhr || xhr.__sentry_own_request__ || !sentryXhrData) {
    return undefined;
  }

  const shouldCreateSpanResult = shouldCreateSpan(sentryXhrData.url);

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

  const scope = getCurrentScope();
  const isolationScope = getIsolationScope();

  const span = shouldCreateSpanResult
    ? startInactiveSpan({
        name: `${sentryXhrData.method} ${sentryXhrData.url}`,
        onlyIfParent: true,
        attributes: {
          type: 'xhr',
          'http.method': sentryXhrData.method,
          url: sentryXhrData.url,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser',
        },
        op: 'http.client',
      })
    : undefined;

  if (span) {
    xhr.__sentry_xhr_span_id__ = span.spanContext().spanId;
    spans[xhr.__sentry_xhr_span_id__] = span;
  }

  const client = getClient();

  if (xhr.setRequestHeader && shouldAttachHeaders(sentryXhrData.url) && client) {
    const { traceId, spanId, sampled, dsc } = {
      ...isolationScope.getPropagationContext(),
      ...scope.getPropagationContext(),
    };

    const sentryTraceHeader = span ? spanToTraceHeader(span) : generateSentryTraceHeader(traceId, spanId, sampled);

    const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(
      dsc ||
        (span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromClient(traceId, client, scope)),
    );

    setHeaderOnXhr(xhr, sentryTraceHeader, sentryBaggageHeader);
  }

  return span;
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
