import { diag, DiagLogLevel } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SDK_VERSION } from '@sentry/core';
import { SentryPropagator } from '@sentry/opentelemetry-node';
import { logger } from '@sentry/utils';

import { SentrySampler } from '../opentelemetry/sampler';
import { SentrySpanProcessor } from '../opentelemetry/spanProcessor';
import type { NodeExperimentalClient } from '../types';
import { setupEventContextTrace } from '../utils/setupEventContextTrace';
import { SentryContextManager } from './../opentelemetry/contextManager';
import { getCurrentHub } from './hub';

/**
 * Initialize OpenTelemetry for Node.
 * We use the @sentry/opentelemetry-node package to communicate with OpenTelemetry.
 */
export function initOtel(): void {
  const client = getCurrentHub().getClient<NodeExperimentalClient>();

  if (!client) {
    __DEBUG_BUILD__ &&
      logger.warn(
        'No client available, skipping OpenTelemetry setup. This probably means that `Sentry.init()` was not called before `initOtel()`.',
      );
    return;
  }

  if (client.getOptions().debug) {
    const otelLogger = new Proxy(logger as typeof logger & { verbose: (typeof logger)['debug'] }, {
      get(target, prop, receiver) {
        const actualProp = prop === 'verbose' ? 'debug' : prop;
        return Reflect.get(target, actualProp, receiver);
      },
    });

    diag.setLogger(otelLogger, DiagLogLevel.DEBUG);
  }

  setupEventContextTrace(client);

  const provider = setupOtel(client);
  client.traceProvider = provider;
}

/** Just exported for tests. */
export function setupOtel(client: NodeExperimentalClient): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'node-experimental',
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'sentry',
      [SemanticResourceAttributes.SERVICE_VERSION]: SDK_VERSION,
    }),
    forceFlushTimeoutMillis: 500,
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  // We use a custom context manager to keep context in sync with sentry scope
  const contextManager = new SentryContextManager();

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager,
  });

  return provider;
}
