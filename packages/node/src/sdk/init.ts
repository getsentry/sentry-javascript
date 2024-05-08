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
import { openTelemetrySetupCheck, setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import type { Client, Integration, Options } from '@sentry/types';
import {
  GLOBAL_OBJ,
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

import moduleModule from 'module';
import { httpIntegration } from '../integrations/http';
import { localVariablesIntegration } from '../integrations/local-variables';
import { modulesIntegration } from '../integrations/modules';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
import { spotlightIntegration } from '../integrations/spotlight';
import { getAutoPerformanceIntegrations } from '../integrations/tracing';
import { makeNodeTransport } from '../transports';
import type { NodeClientOptions, NodeOptions } from '../types';
import { defaultStackParser, getSentryRelease } from './api';
import { NodeClient } from './client';
import { initOpenTelemetry } from './initOtel';

function isCjs(): boolean {
  return typeof require !== 'undefined';
}

function getCjsOnlyIntegrations(): Integration[] {
  return isCjs() ? [modulesIntegration()] : [];
}

/** Get the default integrations for the Node Experimental SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
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
    ...getCjsOnlyIntegrations(),
    ...(hasTracingEnabled(options) ? getAutoPerformanceIntegrations() : []),
  ];
}

declare const __IMPORT_META_URL_REPLACEMENT__: string;

/**
 * Initialize Sentry for Node.
 */
export function init(options: NodeOptions | undefined = {}): void {
  const clientOptions = getClientOptions(options);

  if (clientOptions.debug === true) {
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

  if (!isCjs()) {
    const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);

    // Register hook was added in v20.6.0 and v18.19.0
    if (nodeMajor >= 22 || (nodeMajor === 20 && nodeMinor >= 6) || (nodeMajor === 18 && nodeMinor >= 19)) {
      // We need to work around using import.meta.url directly because jest complains about it.
      const importMetaUrl =
        typeof __IMPORT_META_URL_REPLACEMENT__ !== 'undefined' ? __IMPORT_META_URL_REPLACEMENT__ : undefined;

      if (!GLOBAL_OBJ._sentryEsmLoaderHookRegistered && importMetaUrl) {
        // @ts-expect-error register is available in these versions
        moduleModule.register('@opentelemetry/instrumentation/hook.mjs', importMetaUrl);
        GLOBAL_OBJ._sentryEsmLoaderHookRegistered = true;
      }
    } else {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[Sentry] You are using Node.js in ESM mode ("import syntax"). The Sentry Node.js SDK is not compatible with ESM in Node.js versions before 18.19.0 or before 20.6.0. Please either build your application with CommonJS ("require() syntax"), or use version 7.x of the Sentry Node.js SDK.',
        );
      });
    }
  }

  setOpenTelemetryContextAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new NodeClient(clientOptions);
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  if (isEnabled(client)) {
    client.init();
  }

  if (options.autoSessionTracking) {
    startSessionTracking();
  }

  updateScopeFromEnvVariables();

  if (options.spotlight) {
    // force integrations to be setup even if no DSN was set
    // If they have already been added before, they will be ignored anyhow
    const integrations = client.getOptions().integrations;
    for (const integration of integrations) {
      client.addIntegration(integration);
    }
    client.addIntegration(
      spotlightIntegration({
        sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined,
      }),
    );
  }

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (!options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client);
  }

  validateOpenTelemetrySetup();
}

function validateOpenTelemetrySetup(): void {
  if (!DEBUG_BUILD) {
    return;
  }

  const setup = openTelemetrySetupCheck();

  const required = ['SentrySpanProcessor', 'SentryContextManager', 'SentryPropagator'] as const;
  for (const k of required) {
    if (!setup.includes(k)) {
      logger.error(
        `You have to set up the ${k}. Without this, the OpenTelemetry & Sentry integration will not work properly.`,
      );
    }
  }

  if (!setup.includes('SentrySampler')) {
    logger.warn(
      'You have to set up the SentrySampler. Without this, the OpenTelemetry & Sentry integration may still work, but sample rates set for the Sentry SDK will not be respected.',
    );
  }
}

function getClientOptions(options: NodeOptions): NodeClientOptions {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const release = getRelease(options.release);

  const autoSessionTracking =
    typeof release !== 'string'
      ? false
      : options.autoSessionTracking === undefined
        ? true
        : options.autoSessionTracking;

  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);

  const baseOptions = dropUndefinedKeys({
    transport: makeNodeTransport,
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
  });

  const overwriteOptions = dropUndefinedKeys({
    release,
    autoSessionTracking,
    tracesSampleRate,
  });

  const clientOptions: NodeClientOptions = {
    ...baseOptions,
    ...options,
    ...overwriteOptions,
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
  const sentryUseEnvironment = (process.env.SENTRY_USE_ENVIRONMENT || '').toLowerCase();
  if (!['false', 'n', 'no', 'off', '0'].includes(sentryUseEnvironment)) {
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

function isEnabled(client: Client): boolean {
  return client.getOptions().enabled !== false && client.getTransport() !== undefined;
}
