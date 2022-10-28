/* eslint-disable max-lines */
import type { DynamicSamplingContext, Span } from '@sentry/types';
import {
  addInstrumentationHandler,
  BAGGAGE_HEADER_NAME,
  dynamicSamplingContextToSentryBaggageHeader,
  isInstanceOf,
  isMatchingPattern,
} from '@sentry/utils';

import { getActiveTransaction, hasTracingEnabled } from '../utils';

export const DEFAULT_TRACING_ORIGINS = ['localhost', /^\//];

/** Options for Request Instrumentation */
export interface RequestInstrumentationOptions {
  /**
   * List of strings / regex where the integration should create Spans out of. Additionally this will be used
   * to define which outgoing requests the `sentry-trace` header will be attached to.
   *
   * Default: ['localhost', /^\//] {@see DEFAULT_TRACING_ORIGINS}
   */
  tracingOrigins: Array<string | RegExp>;

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
   * By default it uses the `tracingOrigins` options as a url match.
   */
  shouldCreateSpanForRequest?(url: string): boolean;
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
    __sentry_xhr__?: {
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
      get: (key: string) => string;
    };

export const defaultRequestInstrumentationOptions: RequestInstrumentationOptions = {
  traceFetch: true,
  traceXHR: true,
  tracingOrigins: DEFAULT_TRACING_ORIGINS,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  const { traceFetch, traceXHR, tracingOrigins, shouldCreateSpanForRequest } = {
    ...defaultRequestInstrumentationOptions,
    ..._options,
  };

  const shouldCreateSpan =
    typeof shouldCreateSpanForRequest === 'function' ? shouldCreateSpanForRequest : (_: string) => true;

  const shouldAttachHeaders = (url: string): boolean => tracingOrigins.some(origin => isMatchingPattern(url, origin));

  const spans: Record<string, Span> = {};

  if (traceFetch) {
    addInstrumentationHandler('fetch', (handlerData: FetchData) => {
      fetchCallback(handlerData, shouldCreateSpan, shouldAttachHeaders, spans);
    });
  }

  if (traceXHR) {
    addInstrumentationHandler('xhr', (handlerData: XHRData) => {
      xhrCallback(handlerData, shouldCreateSpan, shouldAttachHeaders, spans);
    });
  }
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

  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    const span = activeTransaction.startChild({
      data: {
        ...handlerData.fetchData,
        type: 'fetch',
      },
      description: `${handlerData.fetchData.method} ${handlerData.fetchData.url}`,
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

      activeTransaction.metadata.propagations += 1;
    }
  }
}

function addTracingHeadersToFetchRequest(
  request: string | Request,
  dynamicSamplingContext: Partial<DynamicSamplingContext>,
  span: Span,
  options: {
    headers?:
      | {
          [key: string]: string[] | string | undefined;
        }
      | Request['headers'];
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
      // If the same header is appended miultiple times the browser will merge the values into a single request header.
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

    return newHeaders;
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
  if (
    !hasTracingEnabled() ||
    (handlerData.xhr && handlerData.xhr.__sentry_own_request__) ||
    !(handlerData.xhr && handlerData.xhr.__sentry_xhr__ && shouldCreateSpan(handlerData.xhr.__sentry_xhr__.url))
  ) {
    return;
  }

  const xhr = handlerData.xhr.__sentry_xhr__;

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp) {
    const spanId = handlerData.xhr.__sentry_xhr_span_id__;
    if (!spanId) return;

    const span = spans[spanId];
    if (span) {
      span.setHttpStatus(xhr.status_code);
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[spanId];
    }
    return;
  }

  // if not, create a new span to track it
  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    const span = activeTransaction.startChild({
      data: {
        ...xhr.data,
        type: 'xhr',
        method: xhr.method,
        url: xhr.url,
      },
      description: `${xhr.method} ${xhr.url}`,
      op: 'http.client',
    });

    handlerData.xhr.__sentry_xhr_span_id__ = span.spanId;
    spans[handlerData.xhr.__sentry_xhr_span_id__] = span;

    if (handlerData.xhr.setRequestHeader && shouldAttachHeaders(handlerData.xhr.__sentry_xhr__.url)) {
      try {
        handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());

        const dynamicSamplingContext = activeTransaction.getDynamicSamplingContext();
        const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

        if (sentryBaggageHeader) {
          // From MDN: "If this method is called several times with the same header, the values are merged into one single request header."
          // We can therefore simply set a baggage header without checking what was there before
          // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/setRequestHeader
          handlerData.xhr.setRequestHeader(BAGGAGE_HEADER_NAME, sentryBaggageHeader);
        }

        activeTransaction.metadata.propagations += 1;
      } catch (_) {
        // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
      }
    }
  }
}
