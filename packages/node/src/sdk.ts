import { initAndBind } from '@sentry/core';
import { getCurrentClient } from '@sentry/shim';
import { NodeOptions } from './backend';
import { NodeFrontend } from './frontend';

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * const { init } = require('@sentry/node');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * @example
 * const { setContext } = require('@sentry/node');
 * setContext({
 *   extra: { battery: 0.7 },
 *   tags: { user_mode: 'admin' },
 *   user: { id: '4711' },
 * });
 *
 * @example
 * const { addBreadcrumb } = require('@sentry/node');
 * SentryClient.addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 *
 * @example
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 *
 * @see NodeOptions for documentation on configuration options.
 */
export function init(options: NodeOptions): void {
  initAndBind(NodeFrontend, options);
}

/** Returns the current NodeFrontend, if any. */
export function getCurrentFrontend(): NodeFrontend {
  return getCurrentClient() as NodeFrontend;
}
