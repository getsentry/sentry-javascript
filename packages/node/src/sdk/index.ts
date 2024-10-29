import {
  endSession,
  functionToStringIntegration,
  getClient,
  getCurrentScope,
  getIntegrationsToSetup,
  getIsolationScope,
  hasTracingEnabled,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
  startSession,
} from '@sentry/core';
import {
  enhanceDscWithOpenTelemetryRootSpanName,
  openTelemetrySetupCheck,
  setOpenTelemetryContextAsyncContextStrategy,
  setupEventContextTrace,
} from '@sentry/opentelemetry';
import type { Integration, Options } from '@sentry/types';
import {
  consoleSandbox,
  dropUndefinedKeys,
  logger,
  propagationContextFromHeaders,
  stackParserFromStackParserOptions,
} from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { consoleIntegration } from '../integrations/console';
import { nodeContextIntegration } from '../integrations/context';
import { contextLinesIntegration } from '../integrations/contextlines';

import { httpIntegration } from '../integrations/http';
import { localVariablesIntegration } from '../integrations/local-variables';
import { modulesIntegration } from '../integrations/modules';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
import { processThreadBreadcrumbIntegration } from '../integrations/processThread';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightIntegration } from '../integrations/spotlight';
import { getAutoPerformanceIntegrations } from '../integrations/tracing';
import { makeNodeTransport } from '../transports';
import type { NodeClientOptions, NodeOptions } from '../types';
import { isCjs } from '../utils/commonjs';
import { envToBool } from '../utils/envToBool';
import { defaultStackParser, getSentryRelease } from './api';
import { NodeClient } from './client';
import { initOpenTelemetry, maybeInitializeEsmLoader } from './initOtel';

function getCjsOnlyIntegrations(): Integration[] {
  return isCjs() ? [modulesIntegration()] : [];
}

/**
 * Get default integrations, excluding performance.
 */
export function getDefaultIntegrationsWithoutPerformance(): Integration[] {
  return [
    // Common
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
    localVariablesIntegration(),
    nodeContextIntegration(),
    processThreadBreadcrumbIntegration(),
    ...getCjsOnlyIntegrations(),
  ];
}

/** Get the default integrations for the Node SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  return [
    ...getDefaultIntegrationsWithoutPerformance(),
    // We only add performance integrations if tracing is enabled
    // Note that this means that without tracing enabled, e.g. `expressIntegration()` will not be added
    // This means that generally request isolation will work (because that is done by httpIntegration)
    // But `transactionName` will not be set automatically
    ...(shouldAddPerformanceIntegrations(options) ? getAutoPerformanceIntegrations() : []),
  ];
}

function shouldAddPerformanceIntegrations(options: Options): boolean {
  if (!hasTracingEnabled(options)) {
    return false;
  }

  // We want to ensure `tracesSampleRate` is not just undefined/null here
  // eslint-disable-next-line deprecation/deprecation
  return options.enableTracing || options.tracesSampleRate != null || 'tracesSampler' in options;
}

/**
 * Initialize Sentry for Node.
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  return _init(options, getDefaultIntegrations);
}

/**
 * Initialize Sentry for Node, without any integrations added by default.
 */
export function initWithoutDefaultIntegrations(options: NodeOptions | undefined = {}): NodeClient {
  return _init(options, () => []);
}

/**
 * Initialize Sentry for Node, without performance instrumentation.
 */
function _init(
  _options: NodeOptions | undefined = {},
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClient {
  const options = getClientOptions(_options, getDefaultIntegrationsImpl);

  if (options.debug === true) {
    if (DEBUG_BUILD) {
      logger.enable();
    } else {
      // use `console.warn` rather than `logger.warn` since by non-debug bundles have all `logger.x` statements stripped
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
      });
    }
  }

  if (!isCjs() && options.registerEsmLoaderHooks !== false) {
    maybeInitializeEsmLoader(options.registerEsmLoaderHooks === true ? undefined : options.registerEsmLoaderHooks);
  }

  setOpenTelemetryContextAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  if (options.spotlight && !options.integrations.some(({ name }) => name === SPOTLIGHT_INTEGRATION_NAME)) {
    options.integrations.push(
      spotlightIntegration({
        sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined,
      }),
    );
  }

  const client = new NodeClient(options);
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  client.init();

  logger.log(`Running in ${isCjs() ? 'CommonJS' : 'ESM'} mode.`);

  if (options.autoSessionTracking) {
    startSessionTracking();
  }

  client.startClientReportTracking();

  updateScopeFromEnvVariables();

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (!options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client);
    validateOpenTelemetrySetup();
  }

  enhanceDscWithOpenTelemetryRootSpanName(client);
  setupEventContextTrace(client);

  return client;
}

/**
 * Validate that your OpenTelemetry setup is correct.
 */
export function validateOpenTelemetrySetup(): void {
  if (!DEBUG_BUILD) {
    return;
  }

  const setup = openTelemetrySetupCheck();

  const required: ReturnType<typeof openTelemetrySetupCheck> = ['SentryContextManager', 'SentryPropagator'];

  if (hasTracingEnabled()) {
    required.push('SentrySpanProcessor');
  }

  for (const k of required) {
    if (!setup.includes(k)) {
      logger.error(
        `You have to set up the ${k}. Without this, the OpenTelemetry & Sentry integration will not work properly.`,
      );
    }
  }

  if (!setup.includes('SentrySampler')) {
    logger.warn(
      'You have to set up the SentrySampler. Without this, the OpenTelemetry & Sentry integration may still work, but sample rates set for the Sentry SDK will not be respected. If you use a custom sampler, make sure to use `wrapSamplingDecision`.',
    );
  }
}

function getClientOptions(
  options: NodeOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClientOptions {
  const release = getRelease(options.release);

  const autoSessionTracking =
    typeof release !== 'string'
      ? false
      : options.autoSessionTracking === undefined
        ? true
        : options.autoSessionTracking;

  if (options.spotlight == null) {
    const spotlightEnv = envToBool(process.env.SENTRY_SPOTLIGHT, { strict: true });
    if (spotlightEnv == null) {
      options.spotlight = process.env.SENTRY_SPOTLIGHT;
    } else {
      options.spotlight = spotlightEnv;
    }
  }

  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);

  const baseOptions = dropUndefinedKeys({
    transport: makeNodeTransport,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    sendClientReports: true,
  });

  const overwriteOptions = dropUndefinedKeys({
    release,
    autoSessionTracking,
    tracesSampleRate,
  });

  const mergedOptions = {
    ...baseOptions,
    ...options,
    ...overwriteOptions,
  };

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrationsImpl(mergedOptions);
  }

  const clientOptions: NodeClientOptions = {
    ...mergedOptions,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      defaultIntegrations: options.defaultIntegrations,
      integrations: options.integrations,
    }),
  };

  return clientOptions;
}

function getRelease(release: NodeOptions['release']): string | undefined {
  if (release !== undefined) {
    return release;
  }

  const detectedRelease = getSentryRelease();
  if (detectedRelease !== undefined) {
    return detectedRelease;
  }

  return undefined;
}

function getTracesSampleRate(tracesSampleRate: NodeOptions['tracesSampleRate']): number | undefined {
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

/**
 * Update scope and propagation context based on environmental variables.
 *
 * See https://github.com/getsentry/rfcs/blob/main/text/0071-continue-trace-over-process-boundaries.md
 * for more details.
 */
function updateScopeFromEnvVariables(): void {
  if (envToBool(process.env.SENTRY_USE_ENVIRONMENT) !== false) {
    const sentryTraceEnv = process.env.SENTRY_TRACE;
    const baggageEnv = process.env.SENTRY_BAGGAGE;
    const propagationContext = propagationContextFromHeaders(sentryTraceEnv, baggageEnv);
    getCurrentScope().setPropagationContext(propagationContext);
  }
}

/**
 * Enable automatic Session Tracking for the node process.
 */
function startSessionTracking(): void {
  const client = getClient<NodeClient>();
  if (client && client.getOptions().autoSessionTracking) {
    client.initSessionFlusher();
  }

  startSession();

  // Emitted in the case of healthy sessions, error of `mechanism.handled: true` and unhandledrejections because
  // The 'beforeExit' event is not emitted for conditions causing explicit termination,
  // such as calling process.exit() or uncaught exceptions.
  // Ref: https://nodejs.org/api/process.html#process_event_beforeexit
  process.on('beforeExit', () => {
    const session = getIsolationScope().getSession();

    // Only call endSession, if the Session exists on Scope and SessionStatus is not a
    // Terminal Status i.e. Exited or Crashed because
    // "When a session is moved away from ok it must not be updated anymore."
    // Ref: https://develop.sentry.dev/sdk/sessions/
    if (session && session.status !== 'ok') {
      endSession();
    }
  });
}
