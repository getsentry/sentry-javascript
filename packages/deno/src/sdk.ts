import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { ServerRuntimeClientOptions } from '@sentry/core/server';
import {
  createStackParser,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  hasSpansEnabled,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { getTracingIntegrations, getErrorIntegrations } from '@sentry/server-utils';
import { DenoClient } from './client';
import { nodeStackLineParser } from '@sentry/core/server';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { denoContextIntegration } from './integrations/context';
import { contextLinesIntegration } from './integrations/contextlines';
import { denoServeIntegration } from './integrations/deno-serve';
import { denoHttpIntegration } from './integrations/http';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { normalizePathsIntegration } from './integrations/normalizepaths';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeFetchTransport } from './transports';
import type { DenoOptions } from './types';

/** Get the default integrations for the Deno SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  // We return a copy of the defaultIntegrations here to avoid mutating this
  return [
    // Common
    eventFiltersIntegration(),
    requestDataIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    // Deno Specific
    breadcrumbsIntegration(),
    denoContextIntegration(),
    denoServeIntegration(),
    denoHttpIntegration(),
    contextLinesIntegration(),
    normalizePathsIntegration(),
    globalHandlersIntegration(),
    // server-utils integrations
    ...getErrorIntegrations(),
    ...(hasSpansEnabled(options) ? getTracingIntegrations() : []),
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
export function init(options: DenoOptions = {}): Client {
  // Computed into a local rather than written back onto `options`: the default set now
  // depends on the tracing options, so caching it on the caller's object would pin the
  // result of the first `init` for any reused options object.
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrations(options);

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    defaultIntegrations,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({ ...options, defaultIntegrations }),
    transport: options.transport || makeFetchTransport,
  };

  const client = initAndBind(DenoClient, clientOptions);

  // Set up OpenTelemetry compatibility to capture spans from libraries using @opentelemetry/api
  // Note: This is separate from Deno's native OTEL support and doesn't capture auto-instrumented spans
  if (options.enableOpenTelemetrySetup ?? true) {
    setupOpenTelemetryTracer();
  }

  return client;
}
