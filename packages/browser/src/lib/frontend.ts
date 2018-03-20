import { Breadcrumb, FrontendBase, SdkInfo, User } from '@sentry/core';
import {
  addBreadcrumb as shimAddBreadcrumb,
  bindClient,
  getCurrentClient,
  setUserContext as shimSetUserContext,
} from '@sentry/shim';
// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { BrowserBackend, BrowserOptions } from './backend';
import { Raven } from './raven';

export {
  captureEvent,
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
  if (!getCurrentClient()) {
    const client = new BrowserFrontend(options);
    forget(client.install());
    bindClient(client, { breadcrumbs: [], context: {} });
  }
}

/**
 * TODO
 * @param breadcrumb
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  shimAddBreadcrumb(breadcrumb);
}

/**
 * TODO
 * @param breadcrumb
 */
export function setUserContext(user: User): void {
  shimSetUserContext(user);
}
