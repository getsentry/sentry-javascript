import { context, propagation, trace } from '@opentelemetry/api';
import { createTransport, getCurrentScope, getGlobalScope, getIsolationScope, resolvedSyncPromise } from '@sentry/core';
import { init } from '../../src/sdk';
import type { NodeClientOptions } from '../../src/types';

const PUBLIC_DSN = 'https://username@domain/123';

export function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

export function mockSdkInit(options?: Partial<NodeClientOptions>) {
  resetGlobals();
  init({
    dsn: PUBLIC_DSN,
    defaultIntegrations: false,
    // We are disabling client reports because we would be acquiring resources with every init call and that would leak
    // memory every time we call init in the tests
    sendClientReports: false,
    // Use a mock transport to prevent network calls
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    traceLifecycle: 'static',
    ...options,
  });
}

export function cleanupOtel(): void {
  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}
