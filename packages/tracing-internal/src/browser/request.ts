/* eslint-disable max-lines */
import { getCurrentHub, getDynamicSamplingContextFromClient, hasTracingEnabled } from '@sentry/core';
import type { Client, Scope, Span } from '@sentry/types';
import {
  addInstrumentationHandler,
  BAGGAGE_HEADER_NAME,
  browserPerformanceTimeOrigin,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  isInstanceOf,
  SENTRY_XHR_DATA_KEY,
  stringMatchesSomePattern,
} from '@sentry/utils';

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

/** Data returned from fetch callback */
export interface FetchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[]; // the arguments passed to the fetch call itself
  fetchData?: {
    method: string;
    url: string;
    // span_id
    __span?: string;
  };

  // TODO Should this be unknown instead? If we vendor types, make it a Response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
  error?: unknown;

  startTimestamp: number;
  endTimestamp?: number;
}

/** Data returned from XHR request */
export interface XHRData {
  xhr?: {
    [SENTRY_XHR_DATA_KEY]?: {
      method: string;
      url: string;
      status_code: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>;
    };
    __sentry_xhr_span_id__?: string;
    setRequestHeader?: (key: string, val: string) => void;
    getRequestHeader?: (key: string) => string;
    __sentry_own_request__?: boolean;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

type PolymorphicRequestHeaders =
  | Record<string, string | undefined>
  | Array<[string, string]>
  // the below is not preicsely the Header type used in Request, but it'll pass duck-typing
  | {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
      append: (key: string, value: string) => void;
      get: (key: string) => string | null | undefined;
    };

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
    addInstrumentationHandler('fetch', (handlerData: FetchData) => {
      const createdSpan = fetchCallback(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
      if (enableHTTPTimings && createdSpan) {
        addHTTPTimings(createdSpan);
      }
    });
  }

  if (traceXHR) {
    addInstrumentationHandler('xhr', (handlerData: XHRData) => {
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
  const url = span.data.url;

  if (!url) {
    return;
  }

  const cleanup = addPerformanceInstrumentationHandler('resource', ({ entries }) => {
    entries.forEach(entry => {
      if (isPerformanceResourceTiming(entry) && entry.name.endsWith(url)) {
        const spanData = resourceTimingEntryToSpanData(entry);
        spanData.forEach(data => span.setData(...data));
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
 * Create and track fetch request spans
 *
 * @returns Span if a span was created, otherwise void.
 */
export function fetchCallback(
  handlerData: FetchData,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): Span | undefined {
  if (!hasTracingEnabled() || !handlerData.fetchData) {
    return undefined;
  }

  const shouldCreateSpanResult = shouldCreateSpan(handlerData.fetchData.url);

  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = handlerData.fetchData.__span;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      if (handlerData.response) {
        // TODO (kmclb) remove this once types PR goes through
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        span.setHttpStatus(handlerData.response.status);

        const contentLength: string =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          handlerData.response && handlerData.response.headers && handlerData.response.headers.get('content-length');

        const contentLengthNum = parseInt(contentLength);
        if (contentLengthNum > 0) {
          span.setData('http.response_content_length', contentLengthNum);
        }
      } else if (handlerData.error) {
        span.setStatus('internal_error');
      }
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const hub = getCurrentHub();
  const scope = hub.getScope();
  const client = hub.getClient();
  const parentSpan = scope.getSpan();

  const { method, url } = handlerData.fetchData;

  const span =
    shouldCreateSpanResult && parentSpan
      ? parentSpan.startChild({
          data: {
            url,
            type: 'fetch',
            'http.method': method,
          },
          description: `${method} ${url}`,
          op: 'http.client',
          origin: 'auto.http.browser',
        })
      : undefined;

  if (span) {
    handlerData.fetchData.__span = span.spanId;
    spans[span.spanId] = span;
  }

  if (shouldAttachHeaders(handlerData.fetchData.url) && client) {
    const request: string | Request = handlerData.args[0];

    // In case the user hasn't set the second argument of a fetch call we default it to `{}`.
    handlerData.args[1] = handlerData.args[1] || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: { [key: string]: any } = handlerData.args[1];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    options.headers = addTracingHeadersToFetchRequest(request, client, scope, options, span);
  }

  return span;
}

/**
 * Adds sentry-trace and baggage headers to the various forms of fetch headers
 */
export function addTracingHeadersToFetchRequest(
  request: string | unknown, // unknown is actually type Request but we can't export DOM types from this package,
  client: Client,
  scope: Scope,
  options: {
    headers?:
      | {
          [key: string]: string[] | string | undefined;
        }
      | PolymorphicRequestHeaders;
  },
  requestSpan?: Span,
): PolymorphicRequestHeaders | undefined {
  const span = requestSpan || scope.getSpan();

  const transaction = span && span.transaction;

  const { traceId, sampled, dsc } = scope.getPropagationContext();

  const sentryTraceHeader = span ? span.toTraceparent() : generateSentryTraceHeader(traceId, undefined, sampled);
  const dynamicSamplingContext = transaction
    ? transaction.getDynamicSamplingContext()
    : dsc
    ? dsc
    : getDynamicSamplingContextFromClient(traceId, client, scope);

  const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

  const headers =
    typeof Request !== 'undefined' && isInstanceOf(request, Request) ? (request as Request).headers : options.headers;

  if (!headers) {
    return { 'sentry-trace': sentryTraceHeader, baggage: sentryBaggageHeader };
  } else if (typeof Headers !== 'undefined' && isInstanceOf(headers, Headers)) {
    const newHeaders = new Headers(headers as Headers);

    newHeaders.append('sentry-trace', sentryTraceHeader);

    if (sentryBaggageHeader) {
      // If the same header is appended multiple times the browser will merge the values into a single request header.
      // Its therefore safe to simply push a "baggage" entry, even though there might already be another baggage header.
      newHeaders.append(BAGGAGE_HEADER_NAME, sentryBaggageHeader);
    }

    return newHeaders as PolymorphicRequestHeaders;
  } else if (Array.isArray(headers)) {
    const newHeaders = [...headers, ['sentry-trace', sentryTraceHeader]];

    if (sentryBaggageHeader) {
      // If there are multiple entries with the same key, the browser will merge the values into a single request header.
      // Its therefore safe to simply push a "baggage" entry, even though there might already be another baggage header.
      newHeaders.push([BAGGAGE_HEADER_NAME, sentryBaggageHeader]);
    }

    return newHeaders as PolymorphicRequestHeaders;
  } else {
    const existingBaggageHeader = 'baggage' in headers ? headers.baggage : undefined;
    const newBaggageHeaders: string[] = [];

    if (Array.isArray(existingBaggageHeader)) {
      newBaggageHeaders.push(...existingBaggageHeader);
    } else if (existingBaggageHeader) {
      newBaggageHeaders.push(existingBaggageHeader);
    }

    if (sentryBaggageHeader) {
      newBaggageHeaders.push(sentryBaggageHeader);
    }

    return {
      ...(headers as Exclude<typeof headers, Headers>),
      'sentry-trace': sentryTraceHeader,
      baggage: newBaggageHeaders.length > 0 ? newBaggageHeaders.join(',') : undefined,
    };
  }
}

/**
 * Create and track xhr request spans
 *
 * @returns Span if a span was created, otherwise void.
 */
// eslint-disable-next-line complexity
export function xhrCallback(
  handlerData: XHRData,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): Span | undefined {
  const xhr = handlerData.xhr;
  const sentryXhrData = xhr && xhr[SENTRY_XHR_DATA_KEY];

  if (!hasTracingEnabled() || (xhr && xhr.__sentry_own_request__) || !xhr || !sentryXhrData) {
    return undefined;
  }

  const shouldCreateSpanResult = shouldCreateSpan(sentryXhrData.url);

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp && shouldCreateSpanResult) {
    const spanId = xhr.__sentry_xhr_span_id__;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      span.setHttpStatus(sentryXhrData.status_code);
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return undefined;
  }

  const hub = getCurrentHub();
  const scope = hub.getScope();
  const parentSpan = scope.getSpan();

  const span =
    shouldCreateSpanResult && parentSpan
      ? parentSpan.startChild({
          data: {
            ...sentryXhrData.data,
            type: 'xhr',
            'http.method': sentryXhrData.method,
            url: sentryXhrData.url,
          },
          description: `${sentryXhrData.method} ${sentryXhrData.url}`,
          op: 'http.client',
          origin: 'auto.http.browser',
        })
      : undefined;

  if (span) {
    xhr.__sentry_xhr_span_id__ = span.spanId;
    spans[xhr.__sentry_xhr_span_id__] = span;
  }

  if (xhr.setRequestHeader && shouldAttachHeaders(sentryXhrData.url)) {
    if (span) {
      const transaction = span && span.transaction;
      const dynamicSamplingContext = transaction && transaction.getDynamicSamplingContext();
      const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      setHeaderOnXhr(xhr, span.toTraceparent(), sentryBaggageHeader);
    } else {
      const client = hub.getClient();
      const { traceId, sampled, dsc } = scope.getPropagationContext();
      const sentryTraceHeader = generateSentryTraceHeader(traceId, undefined, sampled);
      const dynamicSamplingContext =
        dsc || (client ? getDynamicSamplingContextFromClient(traceId, client, scope) : undefined);
      const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
      setHeaderOnXhr(xhr, sentryTraceHeader, sentryBaggageHeader);
    }
  }

  return span;
}

function setHeaderOnXhr(
  xhr: NonNullable<XHRData['xhr']>,
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
