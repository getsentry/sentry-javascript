import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { AlwaysOnSampler, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { getCurrentHub } from '@sentry/core';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';

import type { NodeExperimentalClient } from './client';
import { setOtelContextAsyncContextStrategy } from './otelContextAsyncContextStrategy';

/**
 * Initialize OpenTelemetry for Node.
 * We use the @sentry/opentelemetry-node package to communicate with OpenTelemetry.
 */
export function initOtel(): () => void {
  const client = getCurrentHub().getClient<NodeExperimentalClient>();

  if (client?.getOptions().debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Create and configure NodeTracerProvider
  const provider = new NodeTracerProvider({
    sampler: new AlwaysOnSampler(),
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
  });

  setOtelContextAsyncContextStrategy();

  // Cleanup function
  return () => {
    void provider.forceFlush();
    void provider.shutdown();
  };
}
