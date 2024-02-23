import {
  endSession,
  functionToStringIntegration,
  getClient,
  getCurrentScope,
  getIntegrationsToSetup,
  getIsolationScope,
  getMainCarrier,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  startSession,
} from '@sentry/core';
import type { Integration, Options, SessionStatus, StackParser } from '@sentry/types';
import {
  GLOBAL_OBJ,
  createStackParser,
  nodeStackLineParser,
  propagationContextFromHeaders,
  stackParserFromStackParserOptions,
} from '@sentry/utils';

import { setNodeAsyncContextStrategy } from './async';
import { NodeClient } from './client';
import { consoleIntegration } from './integrations/console';
import { nodeContextIntegration } from './integrations/context';
import { contextLinesIntegration } from './integrations/contextlines';
import { httpIntegration } from './integrations/http';
import { localVariablesIntegration } from './integrations/local-variables';
import { modulesIntegration } from './integrations/modules';
import { onUncaughtExceptionIntegration } from './integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from './integrations/onunhandledrejection';
import { spotlightIntegration } from './integrations/spotlight';
import { nativeNodeFetchintegration } from './integrations/undici';
import { createGetModuleFromFilename } from './module';
import { makeNodeTransport } from './transports';
import type { NodeClientOptions, NodeOptions } from './types';

/** Get the default integrations for the Node SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  const carrier = getMainCarrier();

  const autoloadedIntegrations = carrier.__SENTRY__?.integrations || [];

  return [
    // Common
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    requestDataIntegration(),
    // Native Wrappers
    consoleIntegration(),
    httpIntegration(),
    nativeNodeFetchintegration(),
    // Global Handlers
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration(),
    // Event Info
    contextLinesIntegration(),
    localVariablesIntegration(),
    nodeContextIntegration(),
    modulesIntegration(),
    ...autoloadedIntegrations,
  ];
}

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/node');
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
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const Sentry = require('@sentry/node');
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
 * @see {@link NodeOptions} for documentation on configuration options.
 */
// eslint-disable-next-line complexity
export function init(options: NodeOptions = {}): void {
  setNodeAsyncContextStrategy();

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  const sentryTracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (options.tracesSampleRate === undefined && sentryTracesSampleRate) {
    const tracesSampleRate = parseFloat(sentryTracesSampleRate);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const detectedRelease = getSentryRelease();
    if (detectedRelease !== undefined) {
      options.release = detectedRelease;
    } else {
      // If release is not provided, then we should disable autoSessionTracking
      options.autoSessionTracking = false;
    }
  }

  if (options.environment === undefined && process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
  }

  if (options.autoSessionTracking === undefined && options.dsn !== undefined) {
    options.autoSessionTracking = true;
  }

  // TODO(v7): Refactor this to reduce the logic above
  const clientOptions: NodeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeNodeTransport,
  };

  initAndBind(options.clientClass || NodeClient, clientOptions);

  if (options.autoSessionTracking) {
    startSessionTracking();
  }

  updateScopeFromEnvVariables();

  if (options.spotlight) {
    const client = getClient();
    if (client) {
      // force integrations to be setup even if no DSN was set
      // If they have already been added before, they will be ignored anyhow
      const integrations = client.getOptions().integrations;
      for (const integration of integrations) {
        client.addIntegration(integration);
      }
      client.addIntegration(
        spotlightIntegration({ sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined }),
      );
    }
  }
}

/**
 * Function that takes an instance of NodeClient and checks if autoSessionTracking option is enabled for that client
 */
export function isAutoSessionTrackingEnabled(client?: NodeClient): boolean {
  if (client === undefined) {
    return false;
  }
  const clientOptions = client && client.getOptions();
  if (clientOptions && clientOptions.autoSessionTracking !== undefined) {
    return clientOptions.autoSessionTracking;
  }
  return false;
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
  if (GLOBAL_OBJ.SENTRY_RELEASE && GLOBAL_OBJ.SENTRY_RELEASE.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  return (
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    process.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    process.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    process.env.VERCEL_BITBUCKET_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    process.env.ZEIT_GITHUB_COMMIT_SHA ||
    process.env.ZEIT_GITLAB_COMMIT_SHA ||
    process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    // Cloudflare Pages - https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables
    process.env.CF_PAGES_COMMIT_SHA ||
    fallback
  );
}

/** Node.js stack parser */
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename()));

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
    const terminalStates: SessionStatus[] = ['exited', 'crashed'];
    // Only call endSession, if the Session exists on Scope and SessionStatus is not a
    // Terminal Status i.e. Exited or Crashed because
    // "When a session is moved away from ok it must not be updated anymore."
    // Ref: https://develop.sentry.dev/sdk/sessions/
    if (session && !terminalStates.includes(session.status)) {
      endSession();
    }
  });
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
