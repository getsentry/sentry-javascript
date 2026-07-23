import { context, diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import { debug, getClient } from '@sentry/core';
import { SentryAsyncLocalStorageContextManager } from '../../src/asyncLocalStorageContextManager';
import { DEBUG_BUILD } from '../../src/debug-build';
import { SentryPropagator } from '../../src/propagator';
import { getSentryResource } from '../../src/resource';
import { setupEventContextTrace } from '../../src/setupEventContextTrace';
import { enhanceDscWithOpenTelemetryRootSpanName } from '../../src/utils/enhanceDscWithOpenTelemetryRootSpanName';
import type { TestClient } from './TestClient';
import { SentryTracerProvider } from '../../src/tracerProvider';

/**
 * Initialize OpenTelemetry for Node.
 */
export function initOtel(): void {
  const client = getClient<TestClient>();

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

  setupOtel();
}

export function setupOtel(): void {
  const provider = new SentryTracerProvider({ resource: getSentryResource('node') });

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());

  const ctxManager = new SentryAsyncLocalStorageContextManager();
  context.setGlobalContextManager(ctxManager);
}
