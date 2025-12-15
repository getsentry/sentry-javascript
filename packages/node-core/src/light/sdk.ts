import type { Integration, Options } from '@sentry/core';
import {
  applySdkMetadata,
  consoleIntegration,
  consoleSandbox,
  debug,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  GLOBAL_OBJ,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  propagationContextFromHeaders,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { childProcessIntegration } from '../integrations/childProcess';
import { nodeContextIntegration } from '../integrations/context';
import { contextLinesIntegration } from '../integrations/contextlines';
import { localVariablesIntegration } from '../integrations/local-variables';
import { modulesIntegration } from '../integrations/modules';
import { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
import { processSessionIntegration } from '../integrations/processSession';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightIntegration } from '../integrations/spotlight';
import { systemErrorIntegration } from '../integrations/systemError';
import { defaultStackParser, getSentryRelease } from '../sdk/api';
import { initializeEsmLoader } from '../sdk/esmLoader';
import { makeNodeTransport } from '../transports';
import type { NodeClientOptions, NodeOptions } from '../types';
import { isCjs } from '../utils/detection';
import { envToBool } from '../utils/envToBool';
import { setAsyncLocalStorageAsyncContextStrategy } from './asyncLocalStorageStrategy';
import { LightNodeClient } from './client';
import { httpServerIntegration } from './integrations/httpServerIntegration';

/**
 * Get default integrations for the Light Node-Core SDK.
 * Note: HTTP and fetch integrations that require OpenTelemetry are not included.
 * The httpServerIntegration is included for automatic request isolation (requires Node.js 22+).
 */
export function getDefaultIntegrations(): Integration[] {
  return [
    // Common
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    requestDataIntegration(),
    systemErrorIntegration(),
    // Native Wrappers
    consoleIntegration(),
    // HTTP Server (automatic request isolation, requires Node.js 22+)
    httpServerIntegration(),
    // Note: httpIntegration() and nativeNodeFetchIntegration() are not included in light mode as they require OpenTelemetry
    // Global Handlers
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration(),
    // Event Info
    contextLinesIntegration(),
    localVariablesIntegration(),
    nodeContextIntegration(),
    childProcessIntegration(),
    processSessionIntegration(),
    modulesIntegration(),
  ];
}

/**
 * Initialize Sentry for Node in light mode (without OpenTelemetry).
 */
export function init(options: NodeOptions | undefined = {}): LightNodeClient | undefined {
  return _init(options, getDefaultIntegrations);
}

/**
 * Initialize Sentry for Node in light mode, without any integrations added by default.
 */
export function initWithoutDefaultIntegrations(options: NodeOptions | undefined = {}): LightNodeClient {
  return _init(options, () => []);
}

/**
 * Initialize Sentry for Node in light mode.
 */
function _init(
  _options: NodeOptions | undefined = {},
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): LightNodeClient {
  const options = getClientOptions(_options, getDefaultIntegrationsImpl);

  if (options.debug === true) {
    if (DEBUG_BUILD) {
      debug.enable();
    } else {
      // use `console.warn` rather than `debug.warn` since by non-debug bundles have all `debug.x` statements stripped
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
      });
    }
  }

  if (options.registerEsmLoaderHooks !== false) {
    initializeEsmLoader();
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

  applySdkMetadata(options, 'node-core', ['node-core-light']);

  const client = new LightNodeClient(options);
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  client.init();

  GLOBAL_OBJ._sentryInjectLoaderHookRegister?.();

  debug.log(`SDK initialized from ${isCjs() ? 'CommonJS' : 'ESM'} (light mode)`);

  client.startClientReportTracking();

  updateScopeFromEnvVariables();

  return client;
}

function getClientOptions(
  options: NodeOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClientOptions {
  const release = getRelease(options.release);
  const spotlight =
    options.spotlight ?? envToBool(process.env.SENTRY_SPOTLIGHT, { strict: true }) ?? process.env.SENTRY_SPOTLIGHT;
  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);

  const mergedOptions = {
    ...options,
    dsn: options.dsn ?? process.env.SENTRY_DSN,
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT,
    sendClientReports: options.sendClientReports ?? true,
    transport: options.transport ?? makeNodeTransport,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    release,
    tracesSampleRate,
    spotlight,
    debug: envToBool(options.debug ?? process.env.SENTRY_DEBUG),
  };

  const integrations = options.integrations;
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(mergedOptions);

  return {
    ...mergedOptions,
    integrations: getIntegrationsToSetup({
      defaultIntegrations,
      integrations,
    }),
  };
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
