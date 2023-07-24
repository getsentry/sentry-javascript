import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { AlwaysOnSampler, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { getCurrentHub } from '@sentry/core';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';

import type { NodeExperimentalClient } from './client';

/**
 * Initialize OpenTelemetry for Node.
 * We use the @sentry/opentelemetry-node package to communicate with OpenTelemetry.
 */
export function initOtel(): () => void {
  const client = getCurrentHub().getClient<NodeExperimentalClient>();

  if (client?.getOptions().debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // We use the custom otelHooks from the client to communicate with @sentry/opentelemetry-node
  const hooks = client?.otelHooks;

  // Create and configure NodeTracerProvider
  const provider = new NodeTracerProvider({
    sampler: new AlwaysOnSampler(),
  });
  provider.addSpanProcessor(new SentrySpanProcessor({ hooks }));

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
  });

  // Cleanup function
  return () => {
    void provider.forceFlush();
    void provider.shutdown();
  };
}
