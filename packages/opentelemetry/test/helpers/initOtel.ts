import { DiagLogLevel, diag } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { Resource } from '@opentelemetry/resources';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_NAMESPACE,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { SDK_VERSION, getClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { wrapContextManagerClass } from '../../src/contextManager';
import { DEBUG_BUILD } from '../../src/debug-build';
import { SentryPropagator } from '../../src/propagator';
import { SentrySampler } from '../../src/sampler';
import { setupEventContextTrace } from '../../src/setupEventContextTrace';
import { SentrySpanProcessor } from '../../src/spanProcessor';
import type { TestClientInterface } from './TestClient';

/**
 * Initialize OpenTelemetry for Node.
 */
export function initOtel(): void {
  const client = getClient<TestClientInterface>();

  if (!client) {
    DEBUG_BUILD &&
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
export function setupOtel(client: TestClientInterface): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'opentelemetry-test',
      [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
      [SEMRESATTRS_SERVICE_VERSION]: SDK_VERSION,
    }),
    forceFlushTimeoutMillis: 500,
  });
  provider.addSpanProcessor(new SentrySpanProcessor());

  // We use a custom context manager to keep context in sync with sentry scope
  const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);

  // Initialize the provider
  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new SentryContextManager(),
  });

  return provider;
}
