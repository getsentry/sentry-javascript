import { eventToSentryRequest } from '@sentry/core';
import { Event, Response, Status } from '@sentry/types';
import { logger, parseRetryAfterHeader, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /** Locks transport after receiving 429 response */
  private _disabledUntil: Date = new Date(Date.now());

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    if (new Date(Date.now()) < this._disabledUntil) {
      return Promise.reject({
        event,
        reason: `Transport locked till ${this._disabledUntil} due to too many requests.`,
        status: 429,
      });
    }

    const sentryReq = eventToSentryRequest(event, this._api);

    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
        const request = new XMLHttpRequest();

        request.onreadystatechange = () => {
          if (request.readyState !== 4) {
            return;
          }

          const status = Status.fromHttpCode(request.status);

          if (status === Status.Success) {
            resolve({ status });
            return;
          }

          if (status === Status.RateLimit) {
            const now = Date.now();
            this._disabledUntil = new Date(now + parseRetryAfterHeader(now, request.getResponseHeader('Retry-After')));
            logger.warn(`Too many requests, backing off till: ${this._disabledUntil}`);
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
