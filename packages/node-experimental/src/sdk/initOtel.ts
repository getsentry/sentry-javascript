import { diag, DiagLogLevel } from '@opentelemetry/api';
import { AlwaysOnSampler, BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { getCurrentHub } from '@sentry/core';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';

import type { NodeExperimentalClient } from './client';
import { SentryContextManager } from './otelContextManager';

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
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  // We use a custom context manager to keep context in sync with sentry scope
  const contextManager = new SentryContextManager();

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager,
  });

  // Cleanup function
  return () => {
    void provider.forceFlush();
    void provider.shutdown();
  };
}
