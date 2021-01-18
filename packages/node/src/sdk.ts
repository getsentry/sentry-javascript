import { getCurrentHub, initAndBind, Integrations as CoreIntegrations, SDK_VERSION } from '@sentry/core';
import { getMainCarrier, setHubOnCarrier } from '@sentry/hub';
import { getGlobalObject } from '@sentry/utils';
import * as domain from 'domain';

import { NodeOptions } from './backend';
import { NodeClient } from './client';
import { Console, Http, LinkedErrors, OnUncaughtException, OnUnhandledRejection } from './integrations';

export const defaultIntegrations = [
  // Common
  new CoreIntegrations.InboundFilters(),
  new CoreIntegrations.FunctionToString(),
  // Native Wrappers
  new Console(),
  new Http(),
  // Global Handlers
  new OnUncaughtException(),
  new OnUnhandledRejection(),
  // Misc
  new LinkedErrors(),
];

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/node');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTag({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link NodeOptions} for documentation on configuration options.
 */
export function init(options: NodeOptions = {}): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  if (options.tracesSampleRate === undefined && process.env.SENTRY_TRACES_SAMPLE_RATE) {
    const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const global = getGlobalObject<Window>();
    // Prefer env var over global
    if (process.env.SENTRY_RELEASE) {
      options.release = process.env.SENTRY_RELEASE;
    }
    // This supports the variable that sentry-webpack-plugin injects
    else if (global.SENTRY_RELEASE && global.SENTRY_RELEASE.id) {
      options.release = global.SENTRY_RELEASE.id;
    }
  }

  if (options.environment === undefined && process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
  }

  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.node',
    packages: [
      {
        name: 'npm:@sentry/node',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  if ((domain as any).active) {
    setHubOnCarrier(getMainCarrier(), getCurrentHub());
  }

  initAndBind(NodeClient, options);
}

/**
 * This is the getter for lastEventId.
 *
 * @returns The last event id of a captured event.
 */
export function lastEventId(): string | undefined {
  return getCurrentHub().lastEventId();
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NodeClient>();
  if (client) {
    return client.flush(timeout);
  }
  return Promise.reject(false);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NodeClient>();
  if (client) {
    return client.close(timeout);
  }
  return Promise.reject(false);
}
