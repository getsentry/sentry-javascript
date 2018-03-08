import { FrontendBase, Sdk } from '@sentry/core';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
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

  /**
   * Instruments the given function and sends an event to Sentry every time the
   * function throws an exception.
   *
   * @param fn A function to wrap.
   * @returns The wrapped function.
   */
  // tslint:disable-next-line:ban-types prefer-function-over-method
  public wrap(fn: Function, options: object): Function {
    return Raven.wrap(options, fn);
  }
}

/**
 * The Sentry Browser SDK Client.
 *
 * To use this SDK, call the {@link Sdk.create} function as early as possible
 * when loading the web page. To set context information or send manual events,
 * use the provided methods.
 *
 * @example
 * const { SentryClient } = require('@sentry/browser');
 *
 * SentryClient.create({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * SentryClient.captureMessage('Hello, world');
 *
 * @see BrowserOptions for documentation on configuration options.
 */
// tslint:disable-next-line:variable-name
export const SentryClient = new Sdk(BrowserFrontend);
