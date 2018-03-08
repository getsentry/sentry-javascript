import { FrontendBase } from '@sentry/core';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 */
export class BrowserFrontend extends FrontendBase<
  BrowserBackend,
  BrowserOptions
> {
  /** TODO */
  public constructor(options: BrowserOptions) {
    super(BrowserBackend, options);
  }

  /**
   * @inheritDoc
   */
  // tslint:disable-next-line:prefer-function-over-method
  public async captureException(exception: any): Promise<void> {
    Raven.captureException(exception);
  }

  /**
   * @inheritDoc
   */
  // tslint:disable-next-line:prefer-function-over-method
  public async captureMessage(message: string): Promise<void> {
    Raven.captureMessage(message);
  }

  /** TODO */
  public wrap(fn: Function, options: object): Function {
    return Raven.wrap(options, fn);
  }
}

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserFrontend for documentation on the client.
 * @see BrowserOptions for documentation on configuration options.
 */
export const SentryClient = BrowserFrontend;
