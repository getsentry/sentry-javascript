import type { Integration, Options } from '@sentry/core';
import {
  applySdkMetadata,
  consoleSandbox,
  conversationIdIntegration,
  debug,
  envToBool,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  hasSpansEnabled,
  linkedErrorsIntegration,
  propagationContextFromHeaders,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '@sentry/opentelemetry';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import { isMainThread, parentPort } from 'node:worker_threads';
import { detectOrchestrionSetup } from '@sentry/server-utils/orchestrion';
import { registerDiagnosticsChannelInjection } from '@sentry/server-utils/orchestrion/register';
import { DEBUG_BUILD } from '../debug-build';
import { childProcessIntegration } from '../integrations/childProcess';
import { consoleIntegration } from '../integrations/console';
import { nodeContextIntegration } from '../integrations/context';
import { contextLinesIntegration } from '../integrations/contextlines';
import { httpIntegration } from '../integrations/http';
import { localVariablesIntegration } from '../integrations/local-variables';
import { modulesIntegration } from '../integrations/modules';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
import { processSessionIntegration } from '../integrations/processSession';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightIntegration } from '../integrations/spotlight';
import { systemErrorIntegration } from '../integrations/systemError';
import { getAutoPerformanceIntegrations } from '../integrations/tracing';
import { makeNodeTransport } from '../transports';
import type { NodeClientOptions, NodeOptions } from '../types';
import { getEntryPointType } from '../utils/entry-point';
import { getSpotlightConfig } from '../utils/spotlight';
import { defaultStackParser, getSentryRelease } from './api';
import { NodeClient } from './client';
import { initOpenTelemetry } from './initOtel';

/**
 * Get the base default integrations shared by all Node SDK default-integration sets.
 */
function getBaseDefaultIntegrations(): Integration[] {
  return [
    // Common
    eventFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    requestDataIntegration(),
    systemErrorIntegration(),
    conversationIdIntegration(),
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
    childProcessIntegration(),
    processSessionIntegration(),
    modulesIntegration(),
  ];
}

/**
 * Get default integrations, excluding performance.
 */
export function getDefaultIntegrationsWithoutPerformance(): Integration[] {
  return getBaseDefaultIntegrations();
}

/** Get the default integrations for the Node SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  return [
    ...getDefaultIntegrationsWithoutPerformance(),
    // We only add performance integrations if tracing is enabled
    // Note that this means that without tracing enabled, e.g. `expressIntegration()` will not be added
    // This means that generally request isolation will work (because that is done by httpIntegration)
    // But `transactionName` will not be set automatically
    ...(hasSpansEnabled(options) ? getAutoPerformanceIntegrations() : []),
  ];
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
export function initWithoutDefaultIntegrations(options: NodeOptions | undefined = {}): NodeClient | undefined {
  return _init(options, () => []);
}

/**
 * Internal initialization function.
 */
function _init(
  options: NodeOptions | undefined = {},
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClient | undefined {
  // Node re-runs `--require` preloads (though not `--import` ones) on the module loader thread it
  // spawns for `Module.register()`, which `init()` itself triggers (channel injection, the ESM
  // loader hook). So a `--require`d instrument file re-enters `init()` there, on a thread that
  // never runs app code. It is recognizable as the only thread without a `parentPort`:
  // user-created workers always have one and are legitimately instrumented.
  if (!isMainThread && !parentPort) {
    return undefined;
  }

  if (getEntryPointType() === 'require') {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Initializing the SDK via the Node `--require` flag is no longer supported, because Node re-runs `--require` preloads on its module loader thread. Use `--import` instead: `node --import ./instrument.js app.js`',
      );
    });
  }

  applySdkMetadata(options, 'node');

  // Enable debug logging before channel-injection registration below, so its failure modes (e.g. no
  // available Node hook API, dep-resolution errors) actually surface. `getClientOptions` resolves
  // `debug` the same way for the client; resolving it here as well keeps the two in agreement.
  if (envToBool(options.debug ?? process.env.SENTRY_DEBUG)) {
    if (DEBUG_BUILD) {
      debug.enable();
    } else {
      // use `console.warn` rather than `debug.warn` since non-debug bundles have all `debug.x` statements stripped
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
      });
    }
  }

  // Resolve the tracing-affecting options (e.g. `SENTRY_TRACES_SAMPLE_RATE`) up front so that both
  // the span-enablement gate below and default-integration selection see the final values. Without
  // this, enabling tracing purely via env would leave `hasSpansEnabled` false at this point and skip
  // the performance integrations. `getClientOptions` resolves the remaining options later.
  const optionsWithResolvedTracing = {
    ...options,
    tracesSampleRate: getTracesSampleRate(options.tracesSampleRate),
  };

  // Gate channel-based (orchestrion diagnostics-channel) instrumentation on span recording: the
  // channel integrations only produce spans, so with tracing off there are no subscribers and
  // injecting the module hooks would be pointless work. Install the hooks as early as possible,
  // before the app imports its instrumented modules.
  const useChannelInjection = hasSpansEnabled(optionsWithResolvedTracing);
  if (useChannelInjection) {
    registerDiagnosticsChannelInjection();
  }

  // Only use Node SDK defaults if none provided.
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(optionsWithResolvedTracing);

  const clientOptions = getClientOptions({ ...options, defaultIntegrations }, getDefaultIntegrationsImpl);

  // When Sentry does not own an OpenTelemetry tracer provider, scope isolation runs on a pure
  // AsyncLocalStorage strategy instead of the OpenTelemetry context strategy. Instrumentation still
  // emits spans via core `startSpan`; there is just no OTel provider or propagator behind them.
  let asyncLocalStorageLookup: ReturnType<typeof setOpenTelemetryContextAsyncContextStrategy> | undefined;
  if (!clientOptions.enableOpenTelemetrySetup) {
    // The ALS store already is the `{ scope, isolationScope }` object, so no `contextSymbol` is needed
    // to reach it (unlike the OTel context strategy, where it is nested under the OTel context).
    const asyncLocalStorage = setAsyncLocalStorageAsyncContextStrategy();
    asyncLocalStorageLookup = { asyncLocalStorage };
  } else {
    asyncLocalStorageLookup = setOpenTelemetryContextAsyncContextStrategy();
  }

  const scope = getCurrentScope();
  scope.update(clientOptions.initialScope);

  if (clientOptions.spotlight && !clientOptions.integrations.some(({ name }) => name === SPOTLIGHT_INTEGRATION_NAME)) {
    clientOptions.integrations.push(
      spotlightIntegration({
        sidecarUrl: typeof clientOptions.spotlight === 'string' ? clientOptions.spotlight : undefined,
      }),
    );
  }

  const client = new NodeClient(clientOptions);
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  client.init();
  client.asyncLocalStorageLookup = asyncLocalStorageLookup;

  /*! rollup-include-cjs-only */
  debug.log(`SDK initialized from CommonJS`);
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  debug.log(`SDK initialized from ESM`);
  /*! rollup-include-esm-only-end */

  client.startClientReportTracking();

  updateScopeFromEnvVariables();

  // Ensure we flush events when vercel functions are ended
  // See: https://vercel.com/docs/functions/functions-api-reference#sigterm-signal
  if (process.env.VERCEL) {
    process.on('SIGTERM', async () => {
      // We have 500ms for processing here, so we try to make sure to have enough time to send the events
      await client.flush(200);
    });
  }

  // Add Node SDK specific OpenTelemetry setup. `setupEventContextTrace` reads the active span from the
  // OpenTelemetry context, so it only belongs here: without a Sentry tracer provider a foreign OTel
  // span could otherwise override the Sentry trace on error events.
  if (clientOptions.enableOpenTelemetrySetup) {
    initOpenTelemetry(client);
  }

  // Warn about missing or doubled channel injection. Runs after the client
  // is created so the debug logger is enabled and the warning is emitted.
  if (useChannelInjection) {
    detectOrchestrionSetup();
  }

  return client;
}

function getClientOptions(
  options: NodeOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClientOptions {
  const release = getRelease(options.release);

  const spotlight = getSpotlightConfig(options.spotlight);

  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);
  const traceLifecycle = getTraceLifecycle(options.traceLifecycle);

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
    traceLifecycle,
    // Most Node-based SDKs default to running without a Sentry OpenTelemetry tracer provider. SDKs
    // that need OTel spans surfaced in Sentry (nextjs, sveltekit) opt back in by passing `true`.
    enableOpenTelemetrySetup: options.enableOpenTelemetrySetup ?? false,
    debug: envToBool(options.debug ?? process.env.SENTRY_DEBUG),
  };

  const integrations = options.integrations;
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(mergedOptions);

  const resolvedIntegrations = getIntegrationsToSetup({
    defaultIntegrations,
    integrations,
  });

  return {
    ...mergedOptions,
    integrations: resolvedIntegrations,
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

function getTraceLifecycle(traceLifecycle: NodeOptions['traceLifecycle']): 'stream' | 'static' {
  if (traceLifecycle !== undefined) {
    return traceLifecycle;
  }

  const lifecycleFromEnv = process.env.SENTRY_TRACE_LIFECYCLE;

  if (lifecycleFromEnv === 'stream' || lifecycleFromEnv === 'static') {
    return lifecycleFromEnv;
  }

  return 'stream';
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
