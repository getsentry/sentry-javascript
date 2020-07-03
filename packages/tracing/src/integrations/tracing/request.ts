import { addInstrumentationHandler, isInstanceOf, isMatchingPattern } from '@sentry/utils';

import { Span } from '../../span';

import { getActiveTransaction } from './utils';

const defaultTracingOrigins = ['localhost', /^\//];

/**
 * Options for RequestInstrumentation
 */
export interface RequestInstrumentationOptions {
  /**
   * List of strings / regex where the integration should create Spans out of. Additionally this will be used
   * to define which outgoing requests the `sentry-trace` header will be attached to.
   *
   * Default: ['localhost', /^\//]
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

export const defaultRequestInstrumentionOptions: RequestInstrumentationOptions = {
  traceFetch: true,
  traceXHR: true,
  tracingOrigins: defaultTracingOrigins,
};

/** JSDOC */
export interface RequestInstrumentation {
  options: Partial<RequestInstrumentationOptions>;

  /**
   * start tracking requests
   */
  init(): void;
}

export type RequestInstrumentationClass = new (_options?: RequestInstrumentationOptions) => RequestInstrumentation;

/**
 * Data returned from fetch callback
 */
interface FetchData {
  args: any[];
  fetchData: {
    method: string;
    url: string;
    // span_id
    __span?: string;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

/**
 * Data returned from XHR request
 */
interface XHRData {
  xhr?: {
    __sentry_xhr__?: {
      method: string;
      url: string;
      status_code: number;
      data: Record<string, any>;
    };
    __sentry_xhr_span_id__?: string;
    __sentry_own_request__: boolean;
    setRequestHeader?: Function;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

// tslint:disable-next-line: completed-docs
export class RequestTracing implements RequestInstrumentation {
  public options: RequestInstrumentationOptions = defaultRequestInstrumentionOptions;

  public static spans: Record<string, Span | undefined> = {};

  public constructor(_options?: Partial<RequestInstrumentationOptions>) {
    this.options = {
      ...this.options,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public init(): void {
    const { tracingOrigins, shouldCreateSpanForRequest } = this.options;

    const shouldCreateSpan = shouldCreateSpanForRequest
      ? shouldCreateSpanForRequest
      : (url: string) => {
          const origins = tracingOrigins ? tracingOrigins : defaultTracingOrigins;
          let currentOrigin = '';
          try {
            currentOrigin = new URL(url).origin;
          } catch (_) {
            currentOrigin = url;
          }

          return (
            origins.some((origin: string | RegExp) => isMatchingPattern(currentOrigin, origin)) &&
            !isMatchingPattern(url, 'sentry_key')
          );
        };

    // Register tracking for fetch requests;
    if (this.options.traceFetch) {
      addInstrumentationHandler({
        callback: (handlerData: FetchData) => {
          fetchCallback(handlerData, shouldCreateSpan);
        },
        type: 'fetch',
      });
    }

    if (this.options.traceXHR) {
      addInstrumentationHandler({
        callback: (handlerData: XHRData) => {
          xhrCallback(handlerData, shouldCreateSpan);
        },
        type: 'xhr',
      });
    }
  }
}

/**
 * Create and track fetch request spans
 */
function fetchCallback(handlerData: FetchData, shouldCreateSpan: (url: string) => boolean): void {
  if (!shouldCreateSpan(handlerData.fetchData.url)) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.fetchData.__span) {
    const span = RequestTracing.spans[handlerData.fetchData.__span];
    if (span) {
      span.finish();
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
      op: 'http',
    });

    RequestTracing.spans[span.spanId] = span;

    const request = (handlerData.args[0] = handlerData.args[0] as string | Request);
    const options = (handlerData.args[1] = (handlerData.args[1] as { [key: string]: any }) || {});
    let headers = options.headers;
    if (isInstanceOf(request, Request)) {
      headers = (request as Request).headers;
    }
    if (headers) {
      // tslint:disable-next-line: no-unsafe-any
      if (typeof headers.append === 'function') {
        // tslint:disable-next-line: no-unsafe-any
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
function xhrCallback(handlerData: XHRData, shouldCreateSpan: (url: string) => boolean): void {
  if (!handlerData || !handlerData.xhr || !handlerData.xhr.__sentry_xhr__) {
    return;
  }

  const xhr = handlerData.xhr.__sentry_xhr__;
  if (!shouldCreateSpan(xhr.url)) {
    return;
  }

  // We only capture complete, non-sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.xhr.__sentry_xhr_span_id__) {
    const span = RequestTracing.spans[handlerData.xhr.__sentry_xhr_span_id__];
    if (span) {
      span.setData('url', xhr.url);
      span.setData('method', xhr.method);
      span.setHttpStatus(xhr.status_code);
      span.finish();
    }
    return;
  }

  const activeTransaction = getActiveTransaction();
  if (activeTransaction) {
    const span = activeTransaction.startChild({
      data: {
        ...xhr.data,
        type: 'xhr',
      },
      description: `${xhr.method} ${xhr.url}`,
      op: 'http',
    });

    handlerData.xhr.__sentry_xhr_span_id__ = span.spanId;
    RequestTracing.spans[handlerData.xhr.__sentry_xhr_span_id__] = span;

    if (handlerData.xhr.setRequestHeader) {
      try {
        handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());
      } catch (_) {
        // Error: InvalidStateError: Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.
      }
    }
  }
}
