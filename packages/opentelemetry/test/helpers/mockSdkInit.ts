import { ProxyTracerProvider, context, propagation, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { ClientOptions, Options } from '@sentry/core';

import { getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '../../src/asyncContextStrategy';
import { clearOpenTelemetrySetupCheck } from '../../src/utils/setupCheck';
import { init as initTestClient } from './TestClient';
import { initOtel } from './initOtel';

const PUBLIC_DSN = 'https://username@domain/123';

/**
 * Initialize Sentry for Node.
 */
function init(options: Partial<Options> | undefined = {}): void {
  setOpenTelemetryContextAsyncContextStrategy();
  initTestClient(options);
  initOtel();
}

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

export function mockSdkInit(options?: Partial<ClientOptions>) {
  resetGlobals();

  init({ dsn: PUBLIC_DSN, ...options });
}

export function cleanupOtel(_provider?: NodeTracerProvider): void {
  clearOpenTelemetrySetupCheck();
  const provider = getProvider(_provider);

  if (!provider) {
    return;
  }

  void provider.forceFlush();
  void provider.shutdown();

  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();
}

export function getProvider(_provider?: NodeTracerProvider): NodeTracerProvider | undefined {
  let provider = _provider || trace.getTracerProvider();

  if (provider instanceof ProxyTracerProvider) {
    provider = provider.getDelegate();
  }

  if (!(provider instanceof NodeTracerProvider)) {
    return undefined;
  }

  return provider;
}
