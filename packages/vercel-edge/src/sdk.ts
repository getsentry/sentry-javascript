import { diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import type { Client, Integration } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  createStackParser,
  debug,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  getVercelEnv,
  GLOBAL_OBJ,
  _INTERNAL_warnIfClientIsActive,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  _INTERNAL_getReleaseFromCommitEnv as getReleaseFromCommitEnv,
  nodeStackLineParser,
  resolveServerTunnelOption,
} from '@sentry/core/server';
import {
  SentryPropagator,
  SentryTracerProvider,
  setOpenTelemetryContextAsyncContextStrategy,
} from '@sentry/opentelemetry';
import { VercelEdgeClient } from './client';
import { winterCGFetchIntegration } from './integrations/wintercg-fetch';
import { makeEdgeTransport } from './transports';
import type { VercelEdgeOptions } from './types';

declare const process: {
  env: Record<string, string>;
};

const nodeStackParser = createStackParser(nodeStackLineParser());

/** Get the default integrations for the Vercel Edge SDK. */
export function getDefaultIntegrations(): Integration[] {
  return [
    dedupeIntegration(),
    eventFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    winterCGFetchIntegration(),
    consoleIntegration(),
    requestDataIntegration(),
  ];
}

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): Client {
  setOpenTelemetryContextAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations();
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
    const detectedRelease = getSentryRelease();
    if (detectedRelease !== undefined) {
      options.release = detectedRelease;
    }
  }

  options.environment = options.environment || process.env.SENTRY_ENVIRONMENT || getVercelEnv() || process.env.NODE_ENV;

  options.traceLifecycle = options.traceLifecycle ?? getTraceLifecycleFromEnv(process.env.SENTRY_TRACE_LIFECYCLE);

  _INTERNAL_warnIfClientIsActive();

  const client = new VercelEdgeClient({
    ...options,
    ...resolveServerTunnelOption(options.tunnel),
    stackParser: stackParserFromStackParserOptions(options.stackParser || nodeStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeEdgeTransport,
  });
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  client.init();

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (options.enableOpenTelemetrySetup ?? true) {
    setupOtel(client);
  }

  return client;
}

// exported for tests
// eslint-disable-next-line jsdoc/require-jsdoc
export function setupOtel(client: VercelEdgeClient): void {
  if (client.getOptions().debug) {
    setupOpenTelemetryLogger();
  }

  const provider = new SentryTracerProvider();

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());

  client.traceProvider = provider;
}

/**
 * Setup the OTEL logger to use our own debug logger.
 */
function setupOpenTelemetryLogger(): void {
  // Disable diag, to ensure this works even if called multiple times
  diag.disable();
  diag.setLogger(
    {
      error: debug.error,
      warn: debug.warn,
      info: debug.log,
      debug: debug.log,
      verbose: debug.log,
    },
    DiagLogLevel.DEBUG,
  );
}

/**
 * Returns a release dynamically from environment variables.
 */
export function getSentryRelease(fallback?: string): string | undefined {
  // Always read first as Sentry takes this as precedence
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }

  // This supports the variable that sentry-webpack-plugin injects
  if (GLOBAL_OBJ.SENTRY_RELEASE?.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  return getReleaseFromCommitEnv() || fallback;
}

function getTraceLifecycleFromEnv(envVar: string | undefined): 'static' | 'stream' | undefined {
  return envVar === 'stream' || envVar === 'static' ? envVar : undefined;
}
