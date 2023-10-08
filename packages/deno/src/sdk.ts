import { Breadcrumbs, Dedupe, LinkedErrors } from '@sentry/browser';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import {
  getIntegrationsToSetup,
  initAndBind,
  Integrations as CoreIntegrations,
  SDK_VERSION,
  ServerRuntimeClient,
} from '@sentry/core';
import type { StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

import { ContextLines, DenoContext, GlobalHandlers, NormalizePaths, TraceFetch } from './integrations';
import { makeFetchTransport } from './transports';
import type { DenoOptions } from './types';

export const defaultIntegrations = [
  // Common
  new CoreIntegrations.InboundFilters(),
  new CoreIntegrations.FunctionToString(),
  // From Browser
  new Dedupe(),
  new LinkedErrors(),
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
  // new TraceFetch(),
];

const defaultStackParser: StackParser = createStackParser(nodeStackLineParser());

function getHostName(): string | undefined {
  const result = Deno.permissions.querySync({ name: 'sys', kind: 'hostname' });
  return result.state === 'granted' ? Deno.hostname() : undefined;
}

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
  options._metadata = options._metadata || {};
  options._metadata.sdk = options._metadata.sdk || {
    name: 'sentry.javascript.deno',
    packages: [
      {
        name: 'npm:@sentry/deno',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  options.transport = options.transport || makeFetchTransport;

  options.defaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations)];

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeFetchTransport,
    platform: 'deno',
    runtime: { name: 'deno', version: Deno.version.deno },
    serverName: options.serverName || getHostName(),
  };

  initAndBind(ServerRuntimeClient, clientOptions);
}
