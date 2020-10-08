import { eventToSentryRequest } from '@sentry/core';
import { Event, Response, Status } from '@sentry/types';
import { logger, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    const eventType = event.type || 'event';

    if (this._isRateLimited(eventType)) {
      return Promise.reject({
        event,
        reason: `Transport locked till ${this._disabledUntil(eventType)} due to too many requests.`,
        status: 429,
      });
    }

    const sentryReq = eventToSentryRequest(event, this._api);

    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.onreadystatechange = (): void => {
          if (request.readyState !== 4) {
            return;
          }

          const status = Status.fromHttpCode(request.status);

          // Request with 200 that contain `x-sentry-retry-limits` should still handle that header.
          if (status === Status.Success || status === Status.RateLimit) {
            /**
             * "The search for the header name is case-insensitive."
             * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/getResponseHeader
             */
            const limited = this._handleRateLimit({
              'x-sentry-rate-limits': request.getResponseHeader('X-Sentry-Rate-Limits'),
              'retry-after': request.getResponseHeader('Retry-After'),
            });
            if (limited) {
              logger.warn(`Too many requests, backing off till: ${this._disabledUntil(eventType)}`);
            }
          }

          if (status === Status.Success) {
            resolve({ status });
            return;
          }

          reject(request);
        };

        request.open('POST', sentryReq.url);
        for (const header in this.options.headers) {
          if (this.options.headers.hasOwnProperty(header)) {
            request.setRequestHeader(header, this.options.headers[header]);
          }
        }
        request.send(sentryReq.body);
      }),
    );
  }
}
