import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Event, Response, SentryRequest, Session, TransportOptions } from '@sentry/types';
import { getGlobalObject, isNativeFetch, logger, supportsReferrerPolicy, SyncPromise } from '@sentry/utils';

import { BaseTransport } from './base';

type FetchImpl = typeof fetch;

/**
 * A special usecase for incorrectly wrapped Fetch APIs in conjunction with ad-blockers.
 * Whenever someone wraps the Fetch API and returns the wrong promise chain,
 * this chain becomes orphaned and there is no possible way to capture it's rejections
 * other than allowing it bubble up to this very handler. eg.
 *
 * const f = window.fetch;
 * window.fetch = function () {
 *   const p = f.apply(this, arguments);
 *
 *   p.then(function() {
 *     console.log('hi.');
 *   });
 *
 *   return p;
 * }
 *
 * `p.then(function () { ... })` is producing a completely separate promise chain,
 * however, what's returned is `p` - the result of original `fetch` call.
 *
 * This mean, that whenever we use the Fetch API to send our own requests, _and_
 * some ad-blocker blocks it, this orphaned chain will _always_ reject,
 * effectively causing another event to be captured.
 * This makes a whole process become an infinite loop, which we need to somehow
 * deal with, and break it in one way or another.
 *
 * To deal with this issue, we are making sure that we _always_ use the real
 * browser Fetch API, instead of relying on what `window.fetch` exposes.
 * The only downside to this would be missing our own requests as breadcrumbs,
 * but because we are already not doing this, it should be just fine.
 *
 * Possible failed fetch error messages per-browser:
 *
 * Chrome:  Failed to fetch
 * Edge:    Failed to Fetch
 * Firefox: NetworkError when attempting to fetch resource
 * Safari:  resource blocked by content blocker
 */
function getNativeFetchImplementation(): FetchImpl {
  /* eslint-disable @typescript-eslint/unbound-method */

  // Fast path to avoid DOM I/O
  const global = getGlobalObject<Window>();
  if (isNativeFetch(global.fetch)) {
    return global.fetch.bind(global);
  }

  const document = global.document;
  let fetchImpl = global.fetch;
  // eslint-disable-next-line deprecation/deprecation
  if (typeof document?.createElement === `function`) {
    try {
      const sandbox = document.createElement('iframe');
      sandbox.hidden = true;
      document.head.appendChild(sandbox);
      if (sandbox.contentWindow?.fetch) {
        fetchImpl = sandbox.contentWindow.fetch;
      }
      document.head.removeChild(sandbox);
    } catch (e) {
      logger.warn('Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ', e);
    }
  }

  return fetchImpl.bind(global);
  /* eslint-enable @typescript-eslint/unbound-method */
}

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
  /**
   * Fetch API reference which always points to native browser implementation.
   */
  private _fetch: typeof fetch;

  public constructor(options: TransportOptions, fetchImpl: FetchImpl = getNativeFetchImplementation()) {
    super(options);
    this._fetch = fetchImpl;
  }

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
        reason: `Transport for ${sentryRequest.type} requests locked till ${this._disabledUntil(
          sentryRequest.type,
        )} due to too many requests.`,
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
      () =>
        new SyncPromise<Response>((resolve, reject) => {
          void this._fetch(sentryRequest.url, options)
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
