import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata, hasSpansEnabled } from '@sentry/core';
import type { NodeClient } from '@sentry/node-core';
import {
  getDefaultIntegrations as getNodeCoreDefaultIntegrations,
  init as initNodeCore,
  validateOpenTelemetrySetup,
} from '@sentry/node-core';
import { httpIntegration } from '../integrations/http';
import { nativeNodeFetchIntegration } from '../integrations/node-fetch';
import { getAutoPerformanceIntegrations } from '../integrations/tracing';
import type { NodeOptions } from '../types';
import {
  isDiagnosticsChannelInjectionEnabled,
  resolveDiagnosticsChannelInjection,
} from './diagnosticsChannelInjection';
import { initOpenTelemetry } from './initOtel';

/**
 * Get default integrations, excluding performance.
 */
export function getDefaultIntegrationsWithoutPerformance(): Integration[] {
  const nodeCoreIntegrations = getNodeCoreDefaultIntegrations();

  // Filter out the node-core HTTP and NodeFetch integrations and replace them with Node SDK's composite versions
  return nodeCoreIntegrations
    .filter(integration => integration.name !== 'Http' && integration.name !== 'NodeFetch')
    .concat(httpIntegration(), nativeNodeFetchIntegration());
}

/** Get the default integrations for the Node SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  const integrations: Integration[] = [
    ...getDefaultIntegrationsWithoutPerformance(),
    // We only add performance integrations if tracing is enabled
    // Note that this means that without tracing enabled, e.g. `expressIntegration()` will not be added
    // This means that generally request isolation will work (because that is done by httpIntegration)
    // But `transactionName` will not be set automatically
    ...(hasSpansEnabled(options) ? getAutoPerformanceIntegrations() : []),
  ];

  // When the app opted into diagnostics-channel injection (via
  // `experimentalUseDiagnosticsChannelInjection()`) AND span recording is
  // enabled, swap the channel-based integrations in place of OTel equivalents
  // so the two don't both instrument the same library.
  //
  // Every channel-based integration we ship today is a 1:1 replacement for an
  // OTel performance/tracing integration and produces nothing but spans (those
  // only come from `getAutoPerformanceIntegrations()` above), so it's gated on
  // span recording.
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
 * Internal initialization function.
 */
function _init(
  options: NodeOptions | undefined = {},
  getDefaultIntegrationsImpl: (options: Options) => Integration[],
): NodeClient | undefined {
  applySdkMetadata(options, 'node');

  // EXPERIMENTAL: diagnostics-channel injection, opted into via
  // `experimentalUseDiagnosticsChannelInjection()`. Gated on span recording to
  // match the OTel integrations it replaces. With tracing off there are no
  // channel subscribers, so injecting is pointless work. `resolve...()` is
  // memoized, so `getDefaultIntegrations()` (below) sees the same instance.
  const diagnosticsChannelInjection =
    isDiagnosticsChannelInjectionEnabled() && hasSpansEnabled(options)
      ? resolveDiagnosticsChannelInjection()
      : undefined;

  // Install the channel-injection hooks as early as possible, before the app
  // imports its instrumented modules.
  if (diagnosticsChannelInjection) {
    diagnosticsChannelInjection.register();
  }

  const client = initNodeCore({
    ...options,
    // Only use Node SDK defaults if none provided
    defaultIntegrations: options.defaultIntegrations ?? getDefaultIntegrationsImpl(options),
  });

  // Add Node SDK specific OpenTelemetry setup
  if (client && !options.skipOpenTelemetrySetup) {
    initOpenTelemetry(client, {
      spanProcessors: options.openTelemetrySpanProcessors,
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
 * Initialize Sentry for Node, without any integrations added by default.
 */
export function initWithoutDefaultIntegrations(options: NodeOptions | undefined = {}): NodeClient | undefined {
  return _init(options, () => []);
}
