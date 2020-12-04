import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Event, Response, SentryRequest, Session } from '@sentry/types';
import { getGlobalObject, supportsReferrerPolicy, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

const global = getGlobalObject<Window>();

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    return this._sendRequest(eventToSentryRequest(event, this._api), event);
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session): PromiseLike<Response> {
    return this._sendRequest(sessionToSentryRequest(session, this._api), session);
  }

  /**
   * @param sentryRequest Prepared SentryRequest to be delivered
   * @param originalPayload Original payload used to create SentryRequest
   */
  private _sendRequest(sentryRequest: SentryRequest, originalPayload: Event | Session): PromiseLike<Response> {
    if (this._isRateLimited(sentryRequest.type)) {
      return Promise.reject({
        event: originalPayload,
        type: sentryRequest.type,
        reason: `Transport locked till ${this._disabledUntil(sentryRequest.type)} due to too many requests.`,
        status: 429,
      });
    }

    const options: RequestInit = {
      body: sentryRequest.body,
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
          .fetch(sentryRequest.url, options)
          .then(response => {
            const headers = {
              'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
              'retry-after': response.headers.get('Retry-After'),
            };
            this._handleResponse({
              requestType: sentryRequest.type,
              response,
              headers,
              resolve,
              reject,
            });
          })
          .catch(reject);
      }),
    );
  }
}
