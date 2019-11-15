import { Event, Response, Status } from '@sentry/types';
import { getGlobalObject, logger, parseRetryAfterHeader, supportsReferrerPolicy, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

const global = getGlobalObject<Window>();

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
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

    const defaultOptions: RequestInit = {
      body: JSON.stringify(event),
      method: 'POST',
      // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
      // https://caniuse.com/#feat=referrer-policy
      // It doesn't. And it throw exception instead of ignoring this parameter...
      // REF: https://github.com/getsentry/raven-js/issues/1233
      referrerPolicy: (supportsReferrerPolicy() ? 'origin' : '') as ReferrerPolicy,
    };

    return this._buffer.add(
      new SyncPromise<Response>((resolve, reject) => {
        global
          .fetch(this.url, defaultOptions)
          .then(response => {
            const status = Status.fromHttpCode(response.status);

            if (status === Status.Success) {
              resolve({ status });
              return;
            }

            if (status === Status.RateLimit) {
              const now = Date.now();
              this._disabledUntil = new Date(now + parseRetryAfterHeader(now, response.headers.get('Retry-After')));
              logger.warn(`Too many requests, backing off till: ${this._disabledUntil}`);
            }

            reject(response);
          })
          .catch(reject);
      }),
    );
  }
}
