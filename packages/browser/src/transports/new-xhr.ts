import {
  BaseTransportOptions,
  createTransport,
  NewTransport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { SyncPromise } from '@sentry/utils';

export interface XHRTransportOptions extends BaseTransportOptions {
  // TODO choose whatever is preferred here (I like record more for easier readability)
  //headers?: { [key: string]: string };
  headers?: Record<string, string>;
}

/**
 * Creates a Transport that uses the XMLHttpRequest API to send events to Sentry.
 */
export function makeNewXHRTransport(options: XHRTransportOptions): NewTransport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    return new SyncPromise<TransportMakeRequestResponse>((resolve, _reject) => {
      const xhr = new XMLHttpRequest();

      xhr.onreadystatechange = (): void => {
        // TODO make 4 a constant
        if (xhr.readyState === 4) {
          const response = {
            body: xhr.response,
            headers: {
              'x-sentry-rate-limits': xhr.getResponseHeader('X-Sentry-Rate-Limits'),
              'retry-after': xhr.getResponseHeader('Retry-After'),
            },
            reason: xhr.statusText,
            statusCode: xhr.status,
          };

          resolve(response);
        }
      };

      xhr.open('POST', options.url);
      for (const header in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, header)) {
          xhr.setRequestHeader(header, options.headers[header]);
        }
      }
      xhr.send(request.body);
    });
  }

  return createTransport({ bufferSize: options.bufferSize }, makeRequest);
}
