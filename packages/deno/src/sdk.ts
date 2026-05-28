import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { ServerRuntimeClientOptions } from '@sentry-internal/server-utils';
import {
  createStackParser,
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  spanStreamingIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  nodeStackLineParser,
} from '@sentry-internal/server-utils';
import { DenoClient } from './client';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { denoContextIntegration } from './integrations/context';
import { contextLinesIntegration } from './integrations/contextlines';
import { HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED, HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED } from './denoVersion';
import { denoServeIntegration } from './integrations/deno-serve';
import { denoHttpIntegration } from './integrations/http';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { normalizePathsIntegration } from './integrations/normalizepaths';
import { setupOpenTelemetryTracer } from './opentelemetry/tracer';
import { makeFetchTransport } from './transports';
import type { DenoOptions } from './types';

/** Get the default integrations for the Deno SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  // We return a copy of the defaultIntegrations here to avoid mutating this
  return [
    // Common
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    requestDataIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    // Deno Specific
    breadcrumbsIntegration(),
    denoContextIntegration(),
    denoServeIntegration(),
    // node:http client diagnostics channels fire on Deno 2.7.13+
    // server channels arrive at 2.8.0+
    // Include in defaults if at least one is available
    ...(HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED || HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED
      ? [denoHttpIntegration()]
      : []),
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
export function init(options: DenoOptions = {}): Client {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const resolvedIntegrations = getIntegrationsToSetup(options);
  if (options.traceLifecycle === 'stream' && !resolvedIntegrations.some(i => i.name === 'SpanStreaming')) {
    resolvedIntegrations.push(spanStreamingIntegration());
  }

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: resolvedIntegrations,
    transport: options.transport || makeFetchTransport,
  };

  const client = initAndBind(DenoClient, clientOptions);

  // Set up OpenTelemetry compatibility to capture spans from libraries using @opentelemetry/api
  // Note: This is separate from Deno's native OTEL support and doesn't capture auto-instrumented spans
  if (!options.skipOpenTelemetrySetup) {
    setupOpenTelemetryTracer();
  }

  return client;
}
