import type { ServerRuntimeClientOptions } from '@sentry/core';
import {
  dedupeIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
} from '@sentry/core';
import { getIntegrationsToSetup, initAndBind } from '@sentry/core';
import type { Integration, Options, StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser, stackParserFromStackParserOptions } from '@sentry/utils';

import { DenoClient } from './client';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { denoContextIntegration } from './integrations/context';
import { contextLinesIntegration } from './integrations/contextlines';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { normalizePathsIntegration } from './integrations/normalizepaths';
import { makeFetchTransport } from './transports';
import type { DenoOptions } from './types';

/** Get the default integrations for the Deno SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  // We return a copy of the defaultIntegrations here to avoid mutating this
  return [
    // Common
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    // Deno Specific
    breadcrumbsIntegration(),
    denoContextIntegration(),
    contextLinesIntegration(),
    normalizePathsIntegration(),
    globalHandlersIntegration(),
  ];
}

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
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeFetchTransport,
  };

  initAndBind(DenoClient, clientOptions);
}
