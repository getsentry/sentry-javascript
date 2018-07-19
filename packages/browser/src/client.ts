import { BaseClient } from '@sentry/core';
import { SdkInfo } from '@sentry/types';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';

export const SDK_VERSION = '4.0.0-beta.9';

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends BaseClient<BrowserBackend, BrowserOptions> {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserOptions) {
    super(BrowserBackend, options);
  }

  /**
   * @inheritDoc
   */
  public getSdkInfo(): SdkInfo {
    return {
      name: 'sentry.javascript.browser',
      version: SDK_VERSION,
    };
  }

  /**
   * Instruments the given function and sends an event to Sentry every time the
   * function throws an exception.
   * TODO remove this
   *
   * @param fn A function to wrap.
   * @returns The wrapped function.
   */
  // tslint:disable-next-line:ban-types
  public wrap(fn: Function, options: object): Function {
    return Raven.wrap(options, fn);
  }
}
