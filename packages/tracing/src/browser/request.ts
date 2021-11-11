import { addInstrumentationHandler, isInstanceOf, isMatchingPattern } from '@sentry/utils';

import { Span } from '../span';
import { SpanStatus } from '../spanstatus';
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
    __sentry_own_request__?: boolean;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

export const defaultRequestInstrumentationOptions: RequestInstrumentationOptions = {
  traceFetch: true,
  traceXHR: true,
  tracingOrigins: DEFAULT_TRACING_ORIGINS,
};

/** Registers span creators for xhr and fetch requests  */
export function instrumentOutgoingRequests(_options?: Partial<RequestInstrumentationOptions>): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { traceFetch, traceXHR, tracingOrigins, shouldCreateSpanForRequest } = {
    ...defaultRequestInstrumentationOptions,
    ..._options,
  };

  // We should cache url -> decision so that we don't have to compute
  // regexp everytime we create a request.
  const urlMap: Record<string, boolean> = {};

  const defaultShouldCreateSpan = (url: string): boolean => {
    if (urlMap[url]) {
      return urlMap[url];
    }
    const origins = tracingOrigins;
    urlMap[url] =
      origins.some((origin: string | RegExp) => isMatchingPattern(url, origin)) &&
      !isMatchingPattern(url, 'sentry_key');
    return urlMap[url];
  };

  // We want that our users don't have to re-implement shouldCreateSpanForRequest themselves
  // That's why we filter out already unwanted Spans from tracingOrigins
  let shouldCreateSpan = defaultShouldCreateSpan;
  if (typeof shouldCreateSpanForRequest === 'function') {
    shouldCreateSpan = (url: string) => {
      return defaultShouldCreateSpan(url) && shouldCreateSpanForRequest(url);
    };
  }

  const spans: Record<string, Span> = {};

  if (traceFetch) {
    addInstrumentationHandler({
      callback: (handlerData: FetchData) => {
        fetchCallback(handlerData, shouldCreateSpan, spans);
      },
      type: 'fetch',
    });
  }

  if (traceXHR) {
    addInstrumentationHandler({
      callback: (handlerData: XHRData) => {
        xhrCallback(handlerData, shouldCreateSpan, spans);
      },
      type: 'xhr',
    });
  }
}

/**
 * Create and track fetch request spans
 */
export function fetchCallback(
  handlerData: FetchData,
  shouldCreateSpan: (url: string) => boolean,
  spans: Record<string, Span>,
): void {
  if (!hasTracingEnabled() || !(handlerData.fetchData && shouldCreateSpan(handlerData.fetchData.url))) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.fetchData.__span) {
    const span = spans[handlerData.fetchData.__span];
    if (span) {
      if (handlerData.response) {
        // TODO (kmclb) remove this once types PR goes through
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        span.setHttpStatus(handlerData.response.status);
      } else if (handlerData.error) {
        span.setStatus(SpanStatus.InternalError);
      }
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[handlerData.fetchData.__span];
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

    const request = (handlerData.args[0] = handlerData.args[0] as string | Request);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (handlerData.args[1] = (handlerData.args[1] as { [key: string]: any }) || {});
    let headers = options.headers;
    if (isInstanceOf(request, Request)) {
      headers = (request as Request).headers;
    }
    if (headers) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (typeof headers.append === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        headers.append('sentry-trace', span.toTraceparent());
      } else if (Array.isArray(headers)) {
        headers = [...headers, ['sentry-trace', span.toTraceparent()]];
      } else {
        headers = { ...headers, 'sentry-trace': span.toTraceparent() };
      }
    } else {
      headers = { 'sentry-trace': span.toTraceparent() };
    }
    options.headers = headers;
  }
}

/**
 * Create and track xhr request spans
 */
export function xhrCallback(
  handlerData: XHRData,
  shouldCreateSpan: (url: string) => boolean,
  spans: Record<string, Span>,
): void {
  if (
    !hasTracingEnabled() ||
    handlerData.xhr?.__sentry_own_request__ ||
    !(handlerData.xhr?.__sentry_xhr__ && shouldCreateSpan(handlerData.xhr.__sentry_xhr__.url))
  ) {
    return;
  }

  const xhr = handlerData.xhr.__sentry_xhr__;

  // check first if the request has finished and is tracked by an existing span which should now end
  if (handlerData.endTimestamp && handlerData.xhr.__sentry_xhr_span_id__) {
    const span = spans[handlerData.xhr.__sentry_xhr_span_id__];
    if (span) {
      span.setHttpStatus(xhr.status_code);
      span.finish();

      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete spans[handlerData.xhr.__sentry_xhr_span_id__];
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

    if (handlerData.xhr.setRequestHeader) {
      try {
        handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());
      } catch (_) {
        // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
      }
    }
  }
}
