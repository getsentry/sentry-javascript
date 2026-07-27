import { context, propagation, trace } from '@opentelemetry/api';
import type { ClientOptions, Options } from '@sentry/core';
import { flush, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '../../src/asyncContextStrategy';
import { initOtel } from './initOtel';
import type { TestClient } from './TestClient';
import { init as initTestClient } from './TestClient';

const PUBLIC_DSN = 'https://username@domain/123';

/**
 * Initialize Sentry for Node.
 */
function init(options: Partial<Options> | undefined = {}): TestClient {
  setOpenTelemetryContextAsyncContextStrategy();
  const client = initTestClient(options);
  initOtel();
  return client;
}

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
  delete (global as any).__SENTRY__;
}

export function mockSdkInit(options?: Partial<ClientOptions>): TestClient {
  resetGlobals();

  return init({ dsn: PUBLIC_DSN, ...options })!;
}

export async function cleanupOtel(): Promise<void> {
  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();

  await flush();
}
