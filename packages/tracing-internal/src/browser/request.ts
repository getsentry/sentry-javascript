/* eslint-disable max-lines */
import { getCurrentHub, hasTracingEnabled } from '@sentry/core';
import type { DynamicSamplingContext, Span } from '@sentry/types';
import {
  addInstrumentationHandler,
  BAGGAGE_HEADER_NAME,
  dynamicSamplingContextToSentryBaggageHeader,
  isInstanceOf,
  SENTRY_XHR_DATA_KEY,
  stringMatchesSomePattern,
} from '@sentry/utils';

export const DEFAULT_TRACE_PROPAGATION_TARGETS = ['localhost', /^\//];

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
   * Default: ['localhost', /^\//] {@see DEFAULT_TRACE_PROPAGATION_TARGETS}
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
  // TODO (v8): Remove this property
  tracingOrigins: DEFAULT_TRACE_PROPAGATION_TARGETS,
  tracePropagationTargets: DEFAULT_TRACE_PROPAGATION_TARGETS,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  // eslint-disable-next-line deprecation/deprecation
  const { traceFetch, traceXHR, tracePropagationTargets, tracingOrigins, shouldCreateSpanForRequest } = {
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
      fetchCallback(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
    });
  }

  if (traceXHR) {
    addInstrumentationHandler('xhr', (handlerData: XHRData) => {
      xhrCallback(handlerData, shouldCreateSpan, shouldAttachHeadersWithTargets, spans);
    });
  }
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
 */
export function fetchCallback(
  handlerData: FetchData,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): void {
  if (!hasTracingEnabled() || !(handlerData.fetchData && shouldCreateSpan(handlerData.fetchData.url))) {
    return;
  }

  if (handlerData.endTimestamp) {
    const spanId = handlerData.fetchData.__span;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      if (handlerData.response) {
        // TODO (kmclb) remove this once types PR goes through
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        span.setHttpStatus(handlerData.response.status);
      } else if (handlerData.error) {
        span.setStatus('internal_error');
      }
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return;
  }

  const contentLength =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    handlerData.response && handlerData.response.headers && handlerData.response.headers.get('content-length');
  const currentScope = getCurrentHub().getScope();
  const currentSpan = currentScope && currentScope.getSpan();
  const activeTransaction = currentSpan && currentSpan.transaction;

  if (currentSpan && activeTransaction) {
    const { method, url } = handlerData.fetchData;
    const span = currentSpan.startChild({
      data: {
        url,
        type: 'fetch',
        ...(contentLength ? { 'http.response_content_length': contentLength } : {}),
        'http.method': method,
      },
      description: `${method} ${url}`,
      op: 'http.client',
    });

    handlerData.fetchData.__span = span.spanId;
    spans[span.spanId] = span;

    const request: string | Request = handlerData.args[0];

    // In case the user hasn't set the second argument of a fetch call we default it to `{}`.
    handlerData.args[1] = handlerData.args[1] || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: { [key: string]: any } = handlerData.args[1];

    if (shouldAttachHeaders(handlerData.fetchData.url)) {
      options.headers = addTracingHeadersToFetchRequest(
        request,
        activeTransaction.getDynamicSamplingContext(),
        span,
        options,
      );
    }
  }
}

/**
 * Adds sentry-trace and baggage headers to the various forms of fetch headers
 */
export function addTracingHeadersToFetchRequest(
  request: string | unknown, // unknown is actually type Request but we can't export DOM types from this package,
  dynamicSamplingContext: Partial<DynamicSamplingContext>,
  span: Span,
  options: {
    headers?:
      | {
          [key: string]: string[] | string | undefined;
        }
      | PolymorphicRequestHeaders;
  },
): PolymorphicRequestHeaders {
  const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
  const sentryTraceHeader = span.toTraceparent();

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
 */
export function xhrCallback(
  handlerData: XHRData,
  shouldCreateSpan: (url: string) => boolean,
  shouldAttachHeaders: (url: string) => boolean,
  spans: Record<string, Span>,
): void {
  const xhr = handlerData.xhr;
  const sentryXhrData = xhr && xhr[SENTRY_XHR_DATA_KEY];

  if (
    !hasTracingEnabled() ||
    (xhr && xhr.__sentry_own_request__) ||
    !(xhr && sentryXhrData && shouldCreateSpan(sentryXhrData.url))
  ) {
    return;
  }

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp) {
    const spanId = xhr.__sentry_xhr_span_id__;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      span.setHttpStatus(sentryXhrData.status_code);
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return;
  }

  const currentScope = getCurrentHub().getScope();
  const currentSpan = currentScope && currentScope.getSpan();
  const activeTransaction = currentSpan && currentSpan.transaction;

  if (currentSpan && activeTransaction) {
    const span = currentSpan.startChild({
      data: {
        ...sentryXhrData.data,
        type: 'xhr',
        'http.method': sentryXhrData.method,
        url: sentryXhrData.url,
      },
      description: `${sentryXhrData.method} ${sentryXhrData.url}`,
      op: 'http.client',
    });

    xhr.__sentry_xhr_span_id__ = span.spanId;
    spans[xhr.__sentry_xhr_span_id__] = span;

    if (xhr.setRequestHeader && shouldAttachHeaders(sentryXhrData.url)) {
      try {
        xhr.setRequestHeader('sentry-trace', span.toTraceparent());

        const dynamicSamplingContext = activeTransaction.getDynamicSamplingContext();
        const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

        if (sentryBaggageHeader) {
          // From MDN: "If this method is called several times with the same header, the values are merged into one single request header."
          // We can therefore simply set a baggage header without checking what was there before
          // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/setRequestHeader
          xhr.setRequestHeader(BAGGAGE_HEADER_NAME, sentryBaggageHeader);
        }
      } catch (_) {
        // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
      }
    }
  }
}
