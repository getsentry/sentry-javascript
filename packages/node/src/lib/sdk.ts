import { createAndBind } from '@sentry/core';
import { NodeOptions } from './backend';
import { NodeFrontend } from './frontend';

export { addBreadcrumb, captureEvent, setUserContext } from '@sentry/core';
export {
  captureException,
  captureMessage,
  clearScope,
  popScope,
  pushScope,
  setExtraContext,
  setTagsContext,
} from '@sentry/shim';

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
 * TODO
 * @see NodeOptions for documentation on configuration options.
 */
export function create(options: NodeOptions): void {
  createAndBind(NodeFrontend, options);
}
