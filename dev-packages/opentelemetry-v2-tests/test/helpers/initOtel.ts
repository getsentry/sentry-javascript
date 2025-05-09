import { context, diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { Resource } from '@opentelemetry/resources';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { getClient, logger, SDK_VERSION } from '@sentry/core';
import { wrapContextManagerClass } from '../../../../packages/opentelemetry/src/contextManager';
import { DEBUG_BUILD } from '../../../../packages/opentelemetry/src/debug-build';
import { SentryPropagator } from '../../../../packages/opentelemetry/src/propagator';
import { SentrySampler } from '../../../../packages/opentelemetry/src/sampler';
import { setupEventContextTrace } from '../../../../packages/opentelemetry/src/setupEventContextTrace';
import { SentrySpanProcessor } from '../../../../packages/opentelemetry/src/spanProcessor';
import { enhanceDscWithOpenTelemetryRootSpanName } from '../../../../packages/opentelemetry/src/utils/enhanceDscWithOpenTelemetryRootSpanName';
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
export function setupOtel(client: TestClientInterface): BasicTracerProvider {
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'opentelemetry-test',
      // eslint-disable-next-line deprecation/deprecation
      [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
      [ATTR_SERVICE_VERSION]: SDK_VERSION,
    }),
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
