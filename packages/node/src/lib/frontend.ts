import { Breadcrumb, FrontendBase, SdkInfo, User } from '@sentry/core';
import {
  addBreadcrumb as shimAddBreadcrumb,
  bindClient,
  getCurrentClient,
  setUserContext as shimSetUserContext,
} from '@sentry/shim';
// tslint:disable-next-line:no-submodule-imports
import { forget } from '@sentry/utils/dist/lib/async';
import { NodeBackend, NodeOptions } from './backend';
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
 * The Sentry Node SDK Frontend.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeFrontend extends FrontendBase<NodeBackend, NodeOptions> {
  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: NodeOptions) {
    super(NodeBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected getSdkInfo(): SdkInfo {
    return {
      name: 'sentry-node',
      version: Raven.version,
    };
  }
}

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link Sdk.create} function as early as possible
 * in the main entry module. To set context information or send manual events,
 * use the provided methods.
 *
 * @example
 * const { SentryClient } = require('@sentry/node');
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
 *
 * @see NodeOptions for documentation on configuration options.
 */
export function create(options: NodeOptions): void {
  if (!getCurrentClient()) {
    const client = new NodeFrontend(options);
    forget(client.install());
    bindClient(client);
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
