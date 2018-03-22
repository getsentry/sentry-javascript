import { FrontendBase, SdkInfo } from '@sentry/core';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';

/**
 * The Sentry Browser SDK Frontend.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserFrontend extends FrontendBase<
  BrowserBackend,
  BrowserOptions
> {
  /**
   * Creates a new Browser SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserOptions) {
    super(BrowserBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected getSdkInfo(): SdkInfo {
    return {
      name: 'sentry-browser',
      version: Raven.VERSION,
    };
  }

  /**
   * Instruments the given function and sends an event to Sentry every time the
   * function throws an exception.
   *
   * @param fn A function to wrap.
   * @returns The wrapped function.
   */
  // tslint:disable-next-line:ban-types
  public wrap(fn: Function, options: object): Function {
    return Raven.wrap(options, fn);
  }
}
