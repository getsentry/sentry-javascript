import { diag, DiagLogLevel } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { AlwaysOnSampler, BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getCurrentHub, SDK_VERSION } from '@sentry/core';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';
import { logger } from '@sentry/utils';

import type { NodeExperimentalClient } from '../types';
import { SentryContextManager } from './../opentelemetry/contextManager';

/**
 * Initialize OpenTelemetry for Node.
 * We use the @sentry/opentelemetry-node package to communicate with OpenTelemetry.
 */
export function initOtel(): () => void {
  const client = getCurrentHub().getClient<NodeExperimentalClient>();

  if (client?.getOptions().debug) {
    const otelLogger = new Proxy(logger as typeof logger & { verbose: (typeof logger)['debug'] }, {
      get(target, prop, receiver) {
        const actualProp = prop === 'verbose' ? 'debug' : prop;
        return Reflect.get(target, actualProp, receiver);
      },
    });

    diag.setLogger(otelLogger, DiagLogLevel.DEBUG);
  }

  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'node-experimental',
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'sentry',
      [SemanticResourceAttributes.SERVICE_VERSION]: SDK_VERSION,
    }),
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
