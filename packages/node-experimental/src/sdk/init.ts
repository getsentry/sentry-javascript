import {
  endSession,
  getCurrentScope,
  getIntegrationsToSetup,
  getIsolationScope,
  hasTracingEnabled,
  startSession,
} from '@sentry/core';
import {
  defaultStackParser,
  getDefaultIntegrations as getDefaultNodeIntegrations,
  getSentryRelease,
  makeNodeTransport,
  spotlightIntegration,
} from '@sentry/node';
import type { Client, Integration, Options } from '@sentry/types';
import {
  consoleSandbox,
  dropUndefinedKeys,
  logger,
  propagationContextFromHeaders,
  stackParserFromStackParserOptions,
} from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';

import { getAutoPerformanceIntegrations } from '../integrations/getAutoPerformanceIntegrations';
import { httpIntegration } from '../integrations/http';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { setOpenTelemetryContextAsyncContextStrategy } from '../otel/asyncContextStrategy';
import type { NodeExperimentalClientOptions, NodeExperimentalOptions } from '../types';
import { NodeExperimentalClient } from './client';
import { initOtel } from './initOtel';

const ignoredDefaultIntegrations = ['Http', 'Undici'];

/** Get the default integrations for the Node Experimental SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  return [
    ...getDefaultNodeIntegrations(options).filter(i => !ignoredDefaultIntegrations.includes(i.name)),
    httpIntegration(),
    nativeNodeFetchIntegration(),
    ...(hasTracingEnabled(options) ? getAutoPerformanceIntegrations() : []),
  ];
}

/**
 * Initialize Sentry for Node.
 */
export function init(options: NodeExperimentalOptions | undefined = {}): void {
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

  setOpenTelemetryContextAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new NodeExperimentalClient(clientOptions);
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

  // Always init Otel, even if tracing is disabled, because we need it for trace propagation & the HTTP integration
  initOtel();
}

function getClientOptions(options: NodeExperimentalOptions): NodeExperimentalClientOptions {
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

  const clientOptions: NodeExperimentalClientOptions = {
    ...baseOptions,
    ...options,
    ...overwriteOptions,
    instrumenter: 'otel',
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      defaultIntegrations: options.defaultIntegrations,
      integrations: options.integrations,
    }),
  };

  return clientOptions;
}

function getRelease(release: NodeExperimentalOptions['release']): string | undefined {
  if (release !== undefined) {
    return release;
  }

  const detectedRelease = getSentryRelease();
  if (detectedRelease !== undefined) {
    return detectedRelease;
  }

  return undefined;
}

function getTracesSampleRate(tracesSampleRate: NodeExperimentalOptions['tracesSampleRate']): number | undefined {
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
