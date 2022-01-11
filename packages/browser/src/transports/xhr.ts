import { Event, Response, SentryRequest, Session } from '@sentry/types';
import { SentryError, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @param sentryRequest Prepared SentryRequest to be delivered
   * @param originalPayload Original payload used to create SentryRequest
   */
  protected _sendRequest(sentryRequest: SentryRequest, originalPayload: Event | Session): PromiseLike<Response> {
    if (this._isRateLimited(sentryRequest.type)) {
      this.recordLostEvent('ratelimit_backoff', sentryRequest.type);

      return Promise.reject({
        event: originalPayload,
        type: sentryRequest.type,
        reason: `Transport for ${sentryRequest.type} requests locked till ${this._disabledUntil(
          sentryRequest.type,
        )} due to too many requests.`,
        status: 429,
      });
    }

    return this._buffer
      .add(
        () =>
          new SyncPromise<Response>((resolve, reject) => {
            const request = new XMLHttpRequest();

            request.onreadystatechange = (): void => {
              if (request.readyState === 4) {
                const headers = {
                  'x-sentry-rate-limits': request.getResponseHeader('X-Sentry-Rate-Limits'),
                  'retry-after': request.getResponseHeader('Retry-After'),
                };
                this._handleResponse({ requestType: sentryRequest.type, response: request, headers, resolve, reject });
              }
            };

            request.open('POST', sentryRequest.url);
            for (const header in this.options.headers) {
              if (Object.prototype.hasOwnProperty.call(this.options.headers, header)) {
                request.setRequestHeader(header, this.options.headers[header]);
              }
            }
            request.send(sentryRequest.body);
          }),
      )
      .then(undefined, reason => {
        // It's either buffer rejection or any other xhr/fetch error, which are treated as NetworkError.
        if (reason instanceof SentryError) {
          this.recordLostEvent('queue_overflow', sentryRequest.type);
        } else {
          this.recordLostEvent('network_error', sentryRequest.type);
        }
        throw reason;
      });
  }
}
