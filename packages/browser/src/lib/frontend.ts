import { createAndBind, FrontendBase, SdkInfo } from '@sentry/core';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';
export { addBreadcrumb, captureEvent, setUserContext } from '@sentry/core';
export {
  captureException,
  captureMessage,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';

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
 * @example
 * SentryClient.setContext({
 *   extra: { battery: 0.7 },
 *   tags: { user_mode: 'admin' },
 *   user: { id: '4711' },
 * });
 *
 * @example
 * SentryClient.addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * SentryClient.captureMessage('Hello, world!');
 * SentryClient.captureException(new Error('Good bye'));
 * SentryClient.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * TODO
 * @see BrowserOptions for documentation on configuration options.
 */
export function create(options: BrowserOptions): void {
  createAndBind(BrowserFrontend, options);
}
