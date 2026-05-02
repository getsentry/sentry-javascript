import * as os from 'node:os';
import type { Integration, Options } from '@sentry/core';
import {
  applySdkMetadata,
  debug,
  envToBool,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  linkedErrorsIntegration,
  propagationContextFromHeaders,
  requestDataIntegration,
  spanStreamingIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  childProcessIntegration,
  consoleIntegration,
  contextLinesIntegration,
  defaultStackParser,
  getSentryRelease,
  localVariablesIntegration,
  modulesIntegration,
  nodeContextIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  processSessionIntegration,
  spotlightIntegration,
  systemErrorIntegration,
} from '@sentry/node-core';
import {
  httpIntegration,
  LightNodeClient,
  nativeNodeFetchIntegration,
  setAsyncLocalStorageAsyncContextStrategy,
} from '@sentry/node-core/light';
import { makeFetchTransport } from '../transports';
import type { BunOptions } from '../types';

const SPOTLIGHT_INTEGRATION_NAME = 'Spotlight';

/**
 * Get default integrations for the Bun Light SDK.
 */
export function getDefaultIntegrations(): Integration[] {
  return [
    // Common
    eventFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    requestDataIntegration(),
    systemErrorIntegration(),
    // Native Wrappers
    consoleIntegration(),
    httpIntegration(),
    nativeNodeFetchIntegration(),
    // Global Handlers
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration(),
    // Event Info
    contextLinesIntegration(),
    localVariablesIntegration(),
    nodeContextIntegration(),
    modulesIntegration(),
    childProcessIntegration(),
    processSessionIntegration(),
  ];
}

/**
 * Initialize Sentry for Bun in light mode (without OpenTelemetry).
 *
 * This is a lightweight alternative to the default @sentry/bun entry point.
 * It does not load OpenTelemetry or any auto-instrumentation modules, making it
 * suitable for CLI tools and other non-server Bun applications.
 *
 * @example
 * import * as Sentry from '@sentry/bun/light';
 *
 * Sentry.init({ dsn: '__DSN__' });
 */
export function init(userOptions: BunOptions = {}): LightNodeClient | undefined {
  return _init(userOptions, getDefaultIntegrations);
}

/**
 * Initialize Sentry for Bun in light mode, without any integrations added by default.
 */
export function initWithoutDefaultIntegrations(userOptions: BunOptions = {}): LightNodeClient {
  return _init(userOptions, () => []);
}

function _init(
  _options: BunOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): LightNodeClient {
  const options = getClientOptions(_options, getDefaultIntegrationsImpl);

  if (options.debug === true) {
    debug.enable();
  }

  // Use AsyncLocalStorage-based context strategy instead of OpenTelemetry
  setAsyncLocalStorageAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  if (options.spotlight && !options.integrations.some(({ name }) => name === SPOTLIGHT_INTEGRATION_NAME)) {
    options.integrations.push(
      spotlightIntegration({
        sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined,
      }),
    );
  }

  applySdkMetadata(options, 'bun', ['bun', 'node-core']);

  // LightNodeClient expects NodeClientOptions; our merged options are structurally compatible
  const client: LightNodeClient = new LightNodeClient(options as ConstructorParameters<typeof LightNodeClient>[0]);
  getCurrentScope().setClient(client);

  client.init();

  client.startClientReportTracking();

  updateScopeFromEnvVariables();

  if (process.env.VERCEL) {
    process.on('SIGTERM', async () => {
      await client.flush(200);
    });
  }

  return client;
}

function getClientOptions(
  options: BunOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): BunOptions & { integrations: Integration[] } {
  const release = getRelease(options.release);
  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);

  const mergedOptions = {
    ...options,
    dsn: options.dsn ?? process.env.SENTRY_DSN,
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT,
    sendClientReports: options.sendClientReports ?? true,
    transport: options.transport ?? makeFetchTransport,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    platform: 'javascript',
    runtime: { name: 'bun', version: typeof Bun !== 'undefined' ? Bun.version : 'unknown' },
    serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    release,
    tracesSampleRate,
    debug: envToBool(options.debug ?? process.env.SENTRY_DEBUG),
  };

  const integrations = options.integrations;
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(mergedOptions);

  const resolvedIntegrations = getIntegrationsToSetup({
    defaultIntegrations,
    integrations,
  });

  if (mergedOptions.traceLifecycle === 'stream' && !resolvedIntegrations.some(i => i.name === 'SpanStreaming')) {
    resolvedIntegrations.push(spanStreamingIntegration());
  }

  return {
    ...mergedOptions,
    integrations: resolvedIntegrations,
  };
}

function getRelease(release: BunOptions['release']): string | undefined {
  if (release !== undefined) {
    return release;
  }

  const detectedRelease = getSentryRelease();
  if (detectedRelease !== undefined) {
    return detectedRelease;
  }

  return undefined;
}

function getTracesSampleRate(tracesSampleRate: BunOptions['tracesSampleRate']): number | undefined {
  if (tracesSampleRate !== undefined) {
    return tracesSampleRate;
  }

  const sampleRateFromEnv = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (!sampleRateFromEnv) {
    return undefined;
  }

  const parsed = parseFloat(sampleRateFromEnv);
  return isFinite(parsed) ? parsed : undefined;
}

function updateScopeFromEnvVariables(): void {
  if (envToBool(process.env.SENTRY_USE_ENVIRONMENT) !== false) {
    const sentryTraceEnv = process.env.SENTRY_TRACE;
    const baggageEnv = process.env.SENTRY_BAGGAGE;
    const propagationContext = propagationContextFromHeaders(sentryTraceEnv, baggageEnv);
    getCurrentScope().setPropagationContext(propagationContext);
  }
}
