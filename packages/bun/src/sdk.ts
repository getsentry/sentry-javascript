import * as os from 'node:os';
import type { Integration, Options } from '@sentry/core';
import {
  applySdkMetadata,
  functionToStringIntegration,
  hasSpansEnabled,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import {
  consoleIntegration,
  contextLinesIntegration,
  getAutoPerformanceIntegrations,
  httpIntegration,
  init as initNode,
  modulesIntegration,
  nativeNodeFetchIntegration,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  processSessionIntegration,
} from '@sentry/node';
import { bunServerIntegration } from './integrations/bunserver';
import { makeFetchTransport } from './transports';
import type { BunOptions } from './types';

/** Get the default integrations for the Bun SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  // We return a copy of the defaultIntegrations here to avoid mutating this
  return [
    // Common
    // TODO(v11): Replace with eventFiltersIntegration once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    requestDataIntegration(),
    // Native Wrappers
    consoleIntegration(),
    httpIntegration(),
    nativeNodeFetchIntegration(),
    // Global Handlers
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration(),
    // Event Info
    contextLinesIntegration(),
    nodeContextIntegration(),
    modulesIntegration(),
    processSessionIntegration(),
    // Bun Specific
    bunServerIntegration(),
    ...(hasSpansEnabled(_options) ? getAutoPerformanceIntegrations() : []),
  ];
}

/**
 * The Sentry Bun SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/bun');
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
 * @see {@link BunOptions} for documentation on configuration options.
 */
export function init(userOptions: BunOptions = {}): NodeClient | undefined {
  applySdkMetadata(userOptions, 'bun');

  const options = {
    ...userOptions,
    platform: 'javascript',
    runtime: { name: 'bun', version: Bun.version },
    serverName: userOptions.serverName || global.process.env.SENTRY_NAME || os.hostname(),
  };

  options.transport = options.transport || makeFetchTransport;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  return initNode(options);
}
