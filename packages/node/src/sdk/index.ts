import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  hasSpansEnabled,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  logger,
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
import { DEBUG_BUILD } from '../debug-build';
import { childProcessIntegration } from '../integrations/childProcess';
import { nodeContextIntegration } from '../integrations/context';
import { contextLinesIntegration } from '../integrations/contextlines';
import { httpIntegration } from '../integrations/http';
import { localVariablesIntegration } from '../integrations/local-variables';
import { modulesIntegration } from '../integrations/modules';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { onUncaughtExceptionIntegration } from '../integrations/onuncaughtexception';
import { onUnhandledRejectionIntegration } from '../integrations/onunhandledrejection';
import { processSessionIntegration } from '../integrations/processSession';
import { spotlightIntegration } from '../integrations/spotlight';
import { getAutoPerformanceIntegrations } from '../integrations/tracing';
import { makeNodeTransport } from '../transports';
import type { NodeClientOptions, NodeOptions } from '../types';
import { isCjs } from '../utils/commonjs';
import { envToBool } from '../utils/envToBool';
import { defaultStackParser } from './api';
import { getTracesSampleRate, NodeClient } from './client';
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
    // TODO(v10): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
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
    childProcessIntegration(),
    processSessionIntegration(),
    ...getCjsOnlyIntegrations(),
  ];
}

/** Get the default integrations for the Node SDK. */
export function getDefaultIntegrations(options: NodeOptions): Integration[] {
  return [
    ...getDefaultIntegrationsWithoutPerformance(),
    ...(options.spotlight
      ? [spotlightIntegration({ sidecarUrl: typeof options.spotlight === 'string' ? options.spotlight : undefined })]
      : []),
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
export function init(options: NodeOptions = {}): NodeClient | undefined {
  return _init(options, getDefaultIntegrations);
}

/**
 * Initialize Sentry for Node, without any integrations added by default.
 */
export function initWithoutDefaultIntegrations(options: NodeOptions = {}): NodeClient {
  return _init(options, () => []);
}

/**
 * Initialize a Node client with the provided options and default integrations getter function.
 * This is an internal method the SDK uses under the hood to set up things - you should not use this as a user!
 * Instead, use `init()` to initialize the SDK.
 *
 * @hidden
 * @internal
 */
function _init(
  options: NodeOptions = {},
  getDefaultIntegrationsImpl: (options: NodeOptions) => Integration[],
): NodeClient {
  if (!isCjs() && options.registerEsmLoaderHooks !== false) {
    maybeInitializeEsmLoader();
  }

  setOpenTelemetryContextAsyncContextStrategy();

  const clientOptions = getClientOptions(options, getDefaultIntegrationsImpl);
  const client = initAndBind(NodeClient, clientOptions);

  updateScopeFromEnvVariables();

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (!options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client, {
      spanProcessors: options.openTelemetrySpanProcessors,
    });
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

  if (hasSpansEnabled()) {
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
  getDefaultIntegrationsImpl: (options: NodeOptions) => Integration[],
): NodeClientOptions {
  // We need to make sure to extract the tracesSampleRate already here, before we pass it to `getDefaultIntegrationsImpl`
  // As otherwise, the check for `hasSpansEnabled` may not work in all scenarios
  const optionsWithTracesSampleRate = {
    ...options,
    tracesSampleRate: getTracesSampleRate(options.tracesSampleRate),
  };

  const integrations = options.integrations;
  const defaultIntegrations = options.defaultIntegrations ?? getDefaultIntegrationsImpl(optionsWithTracesSampleRate);

  return {
    ...optionsWithTracesSampleRate,
    transport: options.transport ?? makeNodeTransport,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      defaultIntegrations,
      integrations,
    }),
  };
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
