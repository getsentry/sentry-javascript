import { SentryEvent, Transport } from '@sentry/types';
import { serialize, supportsReferrerPolicy } from '@sentry/utils';

/** `fetch` based transport */
export class FetchTransport implements Transport {
  public constructor(public config: { url: string }) {}

  /**
   * @inheritDoc
   */
  public async send(event: SentryEvent): Promise<Response> {
    const defaultOptions: RequestInit = {
      body: serialize(event),
      keepalive: true,
      method: 'POST',
      // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
      // https://caniuse.com/#feat=referrer-policy
      // It doesn't. And it throw exception instead of ignoring this parameter...
      // REF: https://github.com/getsentry/raven-js/issues/1233
      referrerPolicy: (supportsReferrerPolicy()
        ? 'origin'
        : '') as ReferrerPolicy,
    };

    // TODO: Safe _window access
    return window.fetch(this.config.url, defaultOptions);
  }
}
