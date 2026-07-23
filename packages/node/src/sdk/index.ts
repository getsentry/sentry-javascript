import type { Integration, Options } from '@sentry/core';
import {
  applySdkMetadata,
  consoleSandbox,
  conversationIdIntegration,
  debug,
  envToBool,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  hasSpansEnabled,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  propagationContextFromHeaders,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import {
  enhanceDscWithOpenTelemetryRootSpanName,
  openTelemetrySetupCheck,
  setOpenTelemetryContextAsyncContextStrategy,
  setupEventContextTrace,
} from '@sentry/opentelemetry';
import { isMainThread, parentPort } from 'node:worker_threads';
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
import {
  isDiagnosticsChannelInjectionEnabled,
  resolveDiagnosticsChannelInjection,
} from './diagnosticsChannelInjection';
import { initializeEsmLoader } from './esmLoader';
import { initOpenTelemetry } from './initOtel';

/**
 * Get the base default integrations shared by all Node SDK default-integration sets.
 */
function getBaseDefaultIntegrations(): Integration[] {
  return [
    // Common
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line typescript/no-deprecated
    inboundFiltersIntegration(),
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
 * When the app opted into diagnostics-channel injection (via
 * `experimentalUseDiagnosticsChannelInjection()`) AND span recording is enabled, drop the OTel
 * integrations that have a channel-based replacement and append the FULL channel-integration set,
 * so the two never both instrument the same library. Otherwise returns `integrations` unchanged.
 *
 * `_init` applies the same swap to `defaultIntegrations`, but SDKs that seed their integrations
 * through the user `integrations` option instead (e.g. the `@sentry/aws-serverless` Lambda layer
 * entry) never hit that path, so they call this directly from their own `getDefaultIntegrations`.
 *
 * Note the asymmetry: appended channel integrations are not limited to ones whose OTel counterpart
 * was in `integrations`. For `@sentry/node` that makes no difference (the incoming list carries the
 * whole OTel performance set), but a caller with a narrower list (e.g. `@sentry/aws-serverless`)
 * gains channel coverage for libraries it never shipped OTel integrations for. Channel integrations
 * produce nothing but spans, so this is gated on span recording. Exported so SDKs that build their
 * own default-integration set can apply the same logic instead of duplicating it.
 */
export function applyDiagnosticsChannelInjectionIntegrations(
  integrations: Integration[],
  options: Options,
): Integration[] {
  if (isDiagnosticsChannelInjectionEnabled() && hasSpansEnabled(options)) {
    const diagnosticsChannelInjection = resolveDiagnosticsChannelInjection();
    if (diagnosticsChannelInjection) {
      const replaced = new Set(diagnosticsChannelInjection.replacedOtelIntegrationNames);
      return [...integrations.filter(i => !replaced.has(i.name)), ...diagnosticsChannelInjection.integrations];
    }
  }
  return integrations;
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

  // Resolve the tracing-affecting options (e.g. `SENTRY_TRACES_SAMPLE_RATE`) up front so that both
  // the span-enablement gate below and default-integration selection see the final values. Without
  // this, enabling tracing purely via env would leave `hasSpansEnabled` false at this point and skip
  // the performance integrations. `getClientOptions` resolves the remaining options later.
  const optionsWithResolvedTracing = {
    ...options,
    tracesSampleRate: getTracesSampleRate(options.tracesSampleRate),
  };

  // EXPERIMENTAL: diagnostics-channel injection, opted into via
  // `experimentalUseDiagnosticsChannelInjection()`. Gated on span recording to
  // match the OTel integrations it replaces. With tracing off there are no
  // channel subscribers, so injecting is pointless work.
  const diagnosticsChannelInjection =
    isDiagnosticsChannelInjectionEnabled() && hasSpansEnabled(optionsWithResolvedTracing)
      ? resolveDiagnosticsChannelInjection()
      : undefined;

  // Install the channel-injection hooks as early as possible, before the app
  // imports its instrumented modules.
  if (diagnosticsChannelInjection) {
    diagnosticsChannelInjection.register();
  }

  // Only use Node SDK defaults if none provided.
  let defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(optionsWithResolvedTracing);

  // When opted into diagnostics-channel injection, swap the channel-based
  // integrations in place of their OTel equivalents so the two don't both
  // instrument the same library. Done here (rather than in
  // `getDefaultIntegrations`) so it also covers framework SDKs (e.g.
  // `@sentry/nestjs`) that pass their own `defaultIntegrations` array.
  //
  // Only when there's a non-empty default set to swap:
  // `defaultIntegrations: false` (not an array) and `[]` /
  // `initWithoutDefaultIntegrations()` (explicitly no defaults) are left
  // untouched, as appending channel integrations there would resurrect
  // defaults the caller opted out of.
  if (diagnosticsChannelInjection && Array.isArray(defaultIntegrations) && defaultIntegrations.length > 0) {
    const replaced = new Set(diagnosticsChannelInjection.replacedOtelIntegrationNames);
    defaultIntegrations = [
      ...defaultIntegrations.filter(integration => !replaced.has(integration.name)),
      ...diagnosticsChannelInjection.integrations,
    ];
  }

  const clientOptions = getClientOptions({ ...options, defaultIntegrations }, getDefaultIntegrationsImpl);

  if (clientOptions.debug === true) {
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

  if (clientOptions.registerEsmLoaderHooks !== false) {
    initializeEsmLoader();
  }

  setOpenTelemetryContextAsyncContextStrategy(clientOptions);

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

  /*! rollup-include-cjs-only */
  debug.log(`SDK initialized from CommonJS`);
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  debug.log(`SDK initialized from ESM`);
  /*! rollup-include-esm-only-end */

  client.startClientReportTracking();

  updateScopeFromEnvVariables();

  enhanceDscWithOpenTelemetryRootSpanName(client);
  setupEventContextTrace(client);

  // Ensure we flush events when vercel functions are ended
  // See: https://vercel.com/docs/functions/functions-api-reference#sigterm-signal
  if (process.env.VERCEL) {
    process.on('SIGTERM', async () => {
      // We have 500ms for processing here, so we try to make sure to have enough time to send the events
      await client.flush(200);
    });
  }

  // Add Node SDK specific OpenTelemetry setup
  if (!clientOptions.skipOpenTelemetrySetup) {
    initOpenTelemetry(client, {
      spanProcessors: clientOptions.openTelemetrySpanProcessors,
    });
    validateOpenTelemetrySetup();
  }

  // Warn about missing or doubled channel injection. Runs after the client
  // is created so the debug logger is enabled and the warning is emitted.
  if (diagnosticsChannelInjection) {
    diagnosticsChannelInjection.detect();
  }

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

  const hasSentryTracerProvider = setup.includes('SentryTracerProvider');

  if (hasSpansEnabled() && !hasSentryTracerProvider) {
    required.push('SentrySpanProcessor');
  }

  for (const k of required) {
    if (!setup.includes(k)) {
      debug.error(
        `You have to set up the ${k}. Without this, the OpenTelemetry & Sentry integration will not work properly.`,
      );
    }
  }

  if (!hasSentryTracerProvider && !setup.includes('SentrySampler')) {
    debug.warn(
      'You have to set up the SentrySampler. Without this, the OpenTelemetry & Sentry integration may still work, but sample rates set for the Sentry SDK will not be respected. If you use a custom sampler, make sure to use `wrapSamplingDecision`.',
    );
  }
}

function getClientOptions(
  options: NodeOptions,
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClientOptions {
  const release = getRelease(options.release);

  const spotlight = getSpotlightConfig(options.spotlight);

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
