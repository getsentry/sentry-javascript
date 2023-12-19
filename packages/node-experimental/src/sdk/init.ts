import { getIntegrationsToSetup, hasTracingEnabled } from '@sentry/core';
import {
  Integrations,
  defaultIntegrations as defaultNodeIntegrations,
  defaultStackParser,
  getSentryRelease,
  isAnrChildProcess,
  makeNodeTransport,
} from '@sentry/node';
import type { Integration } from '@sentry/types';
import {
  consoleSandbox,
  dropUndefinedKeys,
  logger,
  parseSemver,
  stackParserFromStackParserOptions,
  tracingContextFromHeaders,
} from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';

import { getAutoPerformanceIntegrations } from '../integrations/getAutoPerformanceIntegrations';
import { Http } from '../integrations/http';
import { NodeFetch } from '../integrations/node-fetch';
import { setOpenTelemetryContextAsyncContextStrategy } from '../otel/asyncContextStrategy';
import type { NodeExperimentalClientOptions, NodeExperimentalOptions } from '../types';
import { endSession, getClient, getCurrentScope, getGlobalScope, getIsolationScope, startSession } from './api';
import { NodeExperimentalClient } from './client';
import { getGlobalCarrier } from './globals';
import { setLegacyHubOnCarrier } from './hub';
import { initOtel } from './initOtel';

const NODE_VERSION: ReturnType<typeof parseSemver> = parseSemver(process.versions.node);
const ignoredDefaultIntegrations = ['Http', 'Undici'];

export const defaultIntegrations: Integration[] = [
  ...defaultNodeIntegrations.filter(i => !ignoredDefaultIntegrations.includes(i.name)),
  new Http(),
];

// Only add NodeFetch if Node >= 16, as previous versions do not support it
if (NODE_VERSION.major && NODE_VERSION.major >= 16) {
  defaultIntegrations.push(new NodeFetch());
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

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new NodeExperimentalClient(clientOptions);
  // The client is on the global scope, from where it generally is inherited
  // unless somebody specifically sets a different one on a scope/isolations cope
  getGlobalScope().setClient(client);

  client.setupIntegrations();

  if (options.autoSessionTracking) {
    startSessionTracking();
  }

  updateScopeFromEnvVariables();

  if (options.spotlight) {
    const client = getClient();
    if (client.addIntegration) {
      // force integrations to be setup even if no DSN was set
      client.setupIntegrations(true);
      client.addIntegration(
        new Integrations.Spotlight({
          sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined,
        }),
      );
    }
  }

  // Always init Otel, even if tracing is disabled, because we need it for trace propagation & the HTTP integration
  initOtel();
  setOpenTelemetryContextAsyncContextStrategy();
}

function getClientOptions(options: NodeExperimentalOptions): NodeExperimentalClientOptions {
  const carrier = getGlobalCarrier();
  setLegacyHubOnCarrier(carrier);

  const isTracingEnabled = hasTracingEnabled(options);

  const autoloadedIntegrations = carrier.integrations || [];

  const fullDefaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [
          ...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations),
          ...(isTracingEnabled ? getAutoPerformanceIntegrations() : []),
          ...autoloadedIntegrations,
        ];

  const release = getRelease(options.release);

  // If there is no release, or we are in an ANR child process, we disable autoSessionTracking by default
  const autoSessionTracking =
    typeof release !== 'string' || isAnrChildProcess()
      ? false
      : options.autoSessionTracking === undefined
        ? true
        : options.autoSessionTracking;
  // We enforce tracesSampleRate = 0 in ANR child processes
  const tracesSampleRate = isAnrChildProcess() ? 0 : getTracesSampleRate(options.tracesSampleRate);

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
      defaultIntegrations: fullDefaultIntegrations,
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
    const { propagationContext } = tracingContextFromHeaders(sentryTraceEnv, baggageEnv);
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
