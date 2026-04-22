import { context, diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { debug, getClient } from '@sentry/core';
import { SentryAsyncLocalStorageContextManager } from '../../src/asyncLocalStorageContextManager';
import { DEBUG_BUILD } from '../../src/debug-build';
import { SentryPropagator } from '../../src/propagator';
import { getSentryResource } from '../../src/resource';
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
      debug.warn(
        'No client available, skipping OpenTelemetry setup. This probably means that `Sentry.init()` was not called before `initOtel()`.',
      );
    return;
  }

  if (client.getOptions().debug) {
    // Disable diag, to ensure this works even if called multiple times
    diag.disable();
    diag.setLogger(
      {
        error: debug.error,
        warn: debug.warn,
        info: debug.log,
        debug: debug.log,
        verbose: debug.log,
      },
      DiagLogLevel.DEBUG,
    );
  }

  setupEventContextTrace(client);
  enhanceDscWithOpenTelemetryRootSpanName(client);

  const [provider, spanProcessor] = setupOtel(client);
  client.traceProvider = provider;
  client.spanProcessor = spanProcessor;
}

/** Just exported for tests. */
export function setupOtel(client: TestClientInterface): [BasicTracerProvider, SentrySpanProcessor] {
  const spanProcessor = new SentrySpanProcessor();
  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: getSentryResource('opentelemetry-test'),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [spanProcessor],
  });

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new SentryAsyncLocalStorageContextManager());

  return [provider, spanProcessor];
}
