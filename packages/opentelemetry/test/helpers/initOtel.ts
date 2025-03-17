import { DiagLogLevel, context, diag, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { SDK_VERSION, getClient } from '@sentry/core';
import { logger } from '@sentry/core';

import { wrapContextManagerClass } from '../../src/contextManager';
import { DEBUG_BUILD } from '../../src/debug-build';
import { SentryPropagator } from '../../src/propagator';
import { SentrySampler } from '../../src/sampler';
import { setupEventContextTrace } from '../../src/setupEventContextTrace';
import { SentrySpanProcessor } from '../../src/spanProcessor';
import { enhanceDscWithOpenTelemetryRootSpanName } from '../../src/utils/enhanceDscWithOpenTelemetryRootSpanName';
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
  enhanceDscWithOpenTelemetryRootSpanName(client);

  const provider = setupOtel(client);
  client.traceProvider = provider;
}

/** Just exported for tests. */
export function setupOtel(client: TestClientInterface): NodeTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new NodeTracerProvider({
    sampler: new SentrySampler(client),
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'opentelemetry-test',
        // eslint-disable-next-line deprecation/deprecation
        [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
        [ATTR_SERVICE_VERSION]: SDK_VERSION,
      }),
    ),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [new SentrySpanProcessor()],
  });

  // We use a custom context manager to keep context in sync with sentry scope
  const SentryContextManager = wrapContextManagerClass(AsyncLocalStorageContextManager);

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new SentryContextManager());

  return provider;
}
