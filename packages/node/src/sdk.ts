import { initAndBind } from '@sentry/core';
import { getCurrentClient as shimGetCurrentClient } from '@sentry/minimal';
import { NodeOptions } from './backend';
import { NodeClient } from './client';
import {
  Console,
  Http,
  OnUncaughtException,
  OnUnhandledRejection,
} from './integrations';

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
 *
 * @example
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTags({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 *
 * @example
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
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
  initAndBind(NodeClient, options, [
    new OnUncaughtException(),
    new OnUnhandledRejection(),
    new Console(),
    new Http(),
  ]);
}

/** Returns the current NodeClient, if any. */
export function getCurrentClient(): NodeClient {
  return shimGetCurrentClient() as NodeClient;
}
