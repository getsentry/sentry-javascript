import { eventToSentryRequest } from '@sentry/core';
import { Event, Response, Status } from '@sentry/types';
import { getGlobalObject, logger, supportsReferrerPolicy, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

const global = getGlobalObject<Window>();

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
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

    const options: RequestInit = {
      body: sentryReq.body,
      method: 'POST',
      // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
      // https://caniuse.com/#feat=referrer-policy
      // It doesn't. And it throw exception instead of ignoring this parameter...
      // REF: https://github.com/getsentry/raven-js/issues/1233
      referrerPolicy: (supportsReferrerPolicy() ? 'origin' : '') as ReferrerPolicy,
    };

    if (this.options.fetchParameters !== undefined) {
      Object.assign(options, this.options.fetchParameters);
    }

    if (this.options.headers !== undefined) {
      options.headers = this.options.headers;
    }

    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
        global
          .fetch(sentryReq.url, options)
          .then(response => {
            const status = Status.fromHttpCode(response.status);

            // Request with 200 that contain `x-sentry-retry-limits` should still handle that header.
            if (status === Status.Success || status === Status.RateLimit) {
              /**
               * "The name is case-insensitive."
               * https://developer.mozilla.org/en-US/docs/Web/API/Headers/get
               */
              const limited = this._handleRateLimit({
                'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
                'retry-after': response.headers.get('Retry-After'),
              });
              if (limited) {
                logger.warn(`Too many requests, backing off till: ${this._disabledUntil(eventType)}`);
              }
            }

            if (status === Status.Success) {
              resolve({ status });
              return;
            }

            reject(response);
          })
          .catch(reject);
      }),
    );
  }
}
