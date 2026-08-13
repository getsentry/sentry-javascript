import type { Client, Integration, Options, ServerRuntimeClientOptions, StackParser } from '@sentry/core';
import {
  createStackParser,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  initAndBind,
  linkedErrorsIntegration,
  nodeStackLineParser,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  amqplibIntegration,
  anthropicIntegration,
  awsIntegration,
  expressIntegration,
  firebaseIntegration,
  genericPoolIntegration,
  googleGenAIIntegration,
  graphqlDiagnosticsIntegration,
  hapiIntegration,
  kafkajsIntegration,
  koaIntegration,
  langChainIntegration,
  langGraphIntegration,
  lruMemoizerIntegration,
  mongodbIntegration,
  mongooseIntegration,
  mysqlIntegration,
  mysql2Integration,
  openAIIntegration,
  postgresIntegration,
  postgresJsIntegration,
  tediousIntegration,
  vercelAiIntegration,
  redisIntegration,
} from '@sentry/server-utils/orchestrion';
import { DenoClient } from './client';
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
export function getDefaultIntegrations(_options: Options): Integration[] {
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
    redisIntegration(),
    graphqlDiagnosticsIntegration(),
    vercelAiIntegration(),
    // orchestrion-based instrumentations. We add a deliberate list here rather
    // than every channel integration: each one needs a Deno test proving it
    // records spans.
    //
    // The orchestrion channels may be injected after (or while) the SDK loads.
    // If they never load, these are no-ops.
    amqplibIntegration(),
    anthropicIntegration(),
    awsIntegration(),
    expressIntegration(),
    firebaseIntegration(),
    genericPoolIntegration(),
    googleGenAIIntegration(),
    hapiIntegration(),
    kafkajsIntegration(),
    koaIntegration(),
    langChainIntegration(),
    langGraphIntegration(),
    lruMemoizerIntegration(),
    mongodbIntegration(),
    mongooseIntegration(),
    mysqlIntegration(),
    mysql2Integration(),
    openAIIntegration(),
    postgresIntegration(),
    postgresJsIntegration(),
    tediousIntegration(),
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

  const clientOptions: ServerRuntimeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
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
