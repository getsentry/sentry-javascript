import { SentryResponse, Status } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { supportsReferrerPolicy } from '@sentry/utils/supports';
import { BaseTransport } from './base';

const global = getGlobalObject() as Window;

/** `fetch` based transport */
export class FetchTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public async sendEvent(body: string): Promise<SentryResponse> {
    const defaultOptions: RequestInit = {
      body,
      method: 'POST',
      // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
      // https://caniuse.com/#feat=referrer-policy
      // It doesn't. And it throw exception instead of ignoring this parameter...
      // REF: https://github.com/getsentry/raven-js/issues/1233
      referrerPolicy: (supportsReferrerPolicy() ? 'origin' : '') as ReferrerPolicy,
    };

    return this.buffer.add(
      global.fetch(this.url, defaultOptions).then(response => ({
        status: Status.fromHttpCode(response.status),
      })),
    );
  }
}
