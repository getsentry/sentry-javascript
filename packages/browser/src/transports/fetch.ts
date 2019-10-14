import { Event, Response, Status } from '@sentry/types';
import { getGlobalObject, supportsReferrerPolicy } from '@sentry/utils';

import { BaseTransport } from './base';

const global = getGlobalObject<Window>();

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
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
      global.fetch(this.url, defaultOptions).then(response => ({
        status: Status.fromHttpCode(response.status),
      })),
    );
  }
}
