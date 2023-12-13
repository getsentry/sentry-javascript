import { Breadcrumbs, Dedupe } from '@sentry/browser';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { Integrations as CoreIntegrations, getIntegrationsToSetup, initAndBind } from '@sentry/core';
import type { StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

import { DenoClient } from './client';
import { ContextLines, DenoContext, DenoCron, GlobalHandlers, NormalizePaths } from './integrations';
import { makeFetchTransport } from './transports';
import type { DenoOptions } from './types';

export const defaultIntegrations = [
  // Common
  new CoreIntegrations.InboundFilters(),
  new CoreIntegrations.FunctionToString(),
  new CoreIntegrations.LinkedErrors(),
  // From Browser
  new Dedupe(),
  new Breadcrumbs({
    dom: false,
    history: false,
    xhr: false,
  }),
  // Deno Specific
  new DenoContext(),
  new ContextLines(),
  new NormalizePaths(),
  new GlobalHandlers(),
];

const defaultStackParser: StackParser = createStackParser(nodeStackLineParser());

/**
 * The Sentry Deno SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * import { init } from 'npm:@sentry/deno';
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
 * import { configureScope } from 'npm:@sentry/deno';
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
 * import { addBreadcrumb } from 'npm:@sentry/deno';
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * import * as Sentry from 'npm:@sentry/deno';
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
 * @see {@link DenoOptions} for documentation on configuration options.
 */
export function init(options: DenoOptions = {}): void {
  options.defaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations)];

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeFetchTransport,
  };

  initAndBind(DenoClient, clientOptions);
}
