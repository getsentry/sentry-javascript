import { captureEvent, getClient, isSentryRequestUrl } from '@sentry/core';
import type {
  Client,
  Event as SentryEvent,
  EventProcessor,
  Hub,
  Integration,
  SentryWrappedXMLHttpRequest,
} from '@sentry/types';
import {
  GLOBAL_OBJ,
  SENTRY_XHR_DATA_KEY,
  addExceptionMechanism,
  addFetchInstrumentationHandler,
  addXhrInstrumentationHandler,
  logger,
  supportsNativeFetch,
} from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';

export type HttpStatusCodeRange = [number, number] | number;
export type HttpRequestTarget = string | RegExp;

interface HttpClientOptions {
  /**
   * HTTP status codes that should be considered failed.
   * This array can contain tuples of `[begin, end]` (both inclusive),
   * single status codes, or a combinations of both
   *
   * Example: [[500, 505], 507]
   * Default: [[500, 599]]
   */
  failedRequestStatusCodes?: HttpStatusCodeRange[];

  /**
   * Targets to track for failed requests.
   * This array can contain strings or regular expressions.
   *
   * Example: ['http://localhost', /api\/.*\/]
   * Default: [/.*\/]
   */
  failedRequestTargets?: HttpRequestTarget[];
}

/** HTTPClient integration creates events for failed client side HTTP requests. */
export class HttpClient implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'HttpClient';

  /**
   * @inheritDoc
   */
  public name: string;

  private readonly _options: HttpClientOptions;

  /**
   * @inheritDoc
   *
   * @param options
   */
  public constructor(options?: Partial<HttpClientOptions>) {
    this.name = HttpClient.id;
    this._options = {
      failedRequestStatusCodes: [[500, 599]],
      failedRequestTargets: [/.*/],
      ...options,
    };
  }

  /**
   * @inheritDoc
   *
   * @param options
   */
  public setupOnce(_: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // noop
  }

  /** @inheritdoc */
  public setup(client: Client): void {
    this._wrapFetch(client);
    this._wrapXHR(client);
  }

  /**
   * Interceptor function for fetch requests
   *
   * @param requestInfo The Fetch API request info
   * @param response The Fetch API response
   * @param requestInit The request init object
   */
  private _fetchResponseHandler(requestInfo: RequestInfo, response: Response, requestInit?: RequestInit): void {
    if (this._shouldCaptureResponse(response.status, response.url)) {
      const request = _getRequest(requestInfo, requestInit);

      let requestHeaders, responseHeaders, requestCookies, responseCookies;

      if (_shouldSendDefaultPii()) {
        [{ headers: requestHeaders, cookies: requestCookies }, { headers: responseHeaders, cookies: responseCookies }] =
          [
            { cookieHeader: 'Cookie', obj: request },
            { cookieHeader: 'Set-Cookie', obj: response },
          ].map(({ cookieHeader, obj }) => {
            const headers = this._extractFetchHeaders(obj.headers);
            let cookies;

            try {
              const cookieString = headers[cookieHeader] || headers[cookieHeader.toLowerCase()] || undefined;

              if (cookieString) {
                cookies = this._parseCookieString(cookieString);
              }
            } catch (e) {
              DEBUG_BUILD && logger.log(`Could not extract cookies from header ${cookieHeader}`);
            }

            return {
              headers,
              cookies,
            };
          });
      }

      const event = this._createEvent({
        url: request.url,
        method: request.method,
        status: response.status,
        requestHeaders,
        responseHeaders,
        requestCookies,
        responseCookies,
      });

      captureEvent(event);
    }
  }

  /**
   * Interceptor function for XHR requests
   *
   * @param xhr The XHR request
   * @param method The HTTP method
   * @param headers The HTTP headers
   */
  private _xhrResponseHandler(xhr: XMLHttpRequest, method: string, headers: Record<string, string>): void {
    if (this._shouldCaptureResponse(xhr.status, xhr.responseURL)) {
      let requestHeaders, responseCookies, responseHeaders;

      if (_shouldSendDefaultPii()) {
        try {
          const cookieString = xhr.getResponseHeader('Set-Cookie') || xhr.getResponseHeader('set-cookie') || undefined;

          if (cookieString) {
            responseCookies = this._parseCookieString(cookieString);
          }
        } catch (e) {
          DEBUG_BUILD && logger.log('Could not extract cookies from response headers');
        }

        try {
          responseHeaders = this._getXHRResponseHeaders(xhr);
        } catch (e) {
          DEBUG_BUILD && logger.log('Could not extract headers from response');
        }

        requestHeaders = headers;
      }

      const event = this._createEvent({
        url: xhr.responseURL,
        method,
        status: xhr.status,
        requestHeaders,
        // Can't access request cookies from XHR
        responseHeaders,
        responseCookies,
      });

      captureEvent(event);
    }
  }

  /**
   * Extracts response size from `Content-Length` header when possible
   *
   * @param headers
   * @returns The response size in bytes or undefined
   */
  private _getResponseSizeFromHeaders(headers?: Record<string, string>): number | undefined {
    if (headers) {
      const contentLength = headers['Content-Length'] || headers['content-length'];

      if (contentLength) {
        return parseInt(contentLength, 10);
      }
    }

    return undefined;
  }

  /**
   * Creates an object containing cookies from the given cookie string
   *
   * @param cookieString The cookie string to parse
   * @returns The parsed cookies
   */
  private _parseCookieString(cookieString: string): Record<string, string> {
    return cookieString.split('; ').reduce((acc: Record<string, string>, cookie: string) => {
      const [key, value] = cookie.split('=');
      acc[key] = value;
      return acc;
    }, {});
  }

  /**
   * Extracts the headers as an object from the given Fetch API request or response object
   *
   * @param headers The headers to extract
   * @returns The extracted headers as an object
   */
  private _extractFetchHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};

    headers.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Extracts the response headers as an object from the given XHR object
   *
   * @param xhr The XHR object to extract the response headers from
   * @returns The response headers as an object
   */
  private _getXHRResponseHeaders(xhr: XMLHttpRequest): Record<string, string> {
    const headers = xhr.getAllResponseHeaders();

    if (!headers) {
      return {};
    }

    return headers.split('\r\n').reduce((acc: Record<string, string>, line: string) => {
      const [key, value] = line.split(': ');
      acc[key] = value;
      return acc;
    }, {});
  }

  /**
   * Checks if the given target url is in the given list of targets
   *
   * @param target The target url to check
   * @returns true if the target url is in the given list of targets, false otherwise
   */
  private _isInGivenRequestTargets(target: string): boolean {
    if (!this._options.failedRequestTargets) {
      return false;
    }

    return this._options.failedRequestTargets.some((givenRequestTarget: HttpRequestTarget) => {
      if (typeof givenRequestTarget === 'string') {
        return target.includes(givenRequestTarget);
      }

      return givenRequestTarget.test(target);
    });
  }

  /**
   * Checks if the given status code is in the given range
   *
   * @param status The status code to check
   * @returns true if the status code is in the given range, false otherwise
   */
  private _isInGivenStatusRanges(status: number): boolean {
    if (!this._options.failedRequestStatusCodes) {
      return false;
    }

    return this._options.failedRequestStatusCodes.some((range: HttpStatusCodeRange) => {
      if (typeof range === 'number') {
        return range === status;
      }

      return status >= range[0] && status <= range[1];
    });
  }

  /**
   * Wraps `fetch` function to capture request and response data
   */
  private _wrapFetch(client: Client): void {
    if (!supportsNativeFetch()) {
      return;
    }

    addFetchInstrumentationHandler(handlerData => {
      if (getClient() !== client) {
        return;
      }

      const { response, args } = handlerData;
      const [requestInfo, requestInit] = args as [RequestInfo, RequestInit | undefined];

      if (!response) {
        return;
      }

      this._fetchResponseHandler(requestInfo, response as Response, requestInit);
    });
  }

  /**
   * Wraps XMLHttpRequest to capture request and response data
   */
  private _wrapXHR(client: Client): void {
    if (!('XMLHttpRequest' in GLOBAL_OBJ)) {
      return;
    }

    addXhrInstrumentationHandler(handlerData => {
      if (getClient() !== client) {
        return;
      }

      const xhr = handlerData.xhr as SentryWrappedXMLHttpRequest & XMLHttpRequest;

      const sentryXhrData = xhr[SENTRY_XHR_DATA_KEY];

      if (!sentryXhrData) {
        return;
      }

      const { method, request_headers: headers } = sentryXhrData;

      try {
        this._xhrResponseHandler(xhr, method, headers);
      } catch (e) {
        DEBUG_BUILD && logger.warn('Error while extracting response event form XHR response', e);
      }
    });
  }

  /**
   * Checks whether to capture given response as an event
   *
   * @param status response status code
   * @param url response url
   */
  private _shouldCaptureResponse(status: number, url: string): boolean {
    return (
      this._isInGivenStatusRanges(status) && this._isInGivenRequestTargets(url) && !isSentryRequestUrl(url, getClient())
    );
  }

  /**
   * Creates a synthetic Sentry event from given response data
   *
   * @param data response data
   * @returns event
   */
  private _createEvent(data: {
    url: string;
    method: string;
    status: number;
    responseHeaders?: Record<string, string>;
    responseCookies?: Record<string, string>;
    requestHeaders?: Record<string, string>;
    requestCookies?: Record<string, string>;
  }): SentryEvent {
    const message = `HTTP Client Error with status code: ${data.status}`;

    const event: SentryEvent = {
      message,
      exception: {
        values: [
          {
            type: 'Error',
            value: message,
          },
        ],
      },
      request: {
        url: data.url,
        method: data.method,
        headers: data.requestHeaders,
        cookies: data.requestCookies,
      },
      contexts: {
        response: {
          status_code: data.status,
          headers: data.responseHeaders,
          cookies: data.responseCookies,
          body_size: this._getResponseSizeFromHeaders(data.responseHeaders),
        },
      },
    };

    addExceptionMechanism(event, {
      type: 'http.client',
      handled: false,
    });

    return event;
  }
}

function _getRequest(requestInfo: RequestInfo, requestInit?: RequestInit): Request {
  if (!requestInit && requestInfo instanceof Request) {
    return requestInfo;
  }

  // If both are set, we try to construct a new Request with the given arguments
  // However, if e.g. the original request has a `body`, this will throw an error because it was already accessed
  // In this case, as a fallback, we just use the original request - using both is rather an edge case
  if (requestInfo instanceof Request && requestInfo.bodyUsed) {
    return requestInfo;
  }

  return new Request(requestInfo, requestInit);
}

function _shouldSendDefaultPii(): boolean {
  const client = getClient();
  return client ? Boolean(client.getOptions().sendDefaultPii) : false;
}
