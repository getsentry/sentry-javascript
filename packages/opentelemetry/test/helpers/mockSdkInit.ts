import { ProxyTracerProvider, context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ClientOptions, Options } from '@sentry/types';

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

export function cleanupOtel(_provider?: BasicTracerProvider): void {
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

export function getProvider(_provider?: BasicTracerProvider): BasicTracerProvider | undefined {
  let provider = _provider || trace.getTracerProvider();

  if (provider instanceof ProxyTracerProvider) {
    provider = provider.getDelegate();
  }

  if (!(provider instanceof BasicTracerProvider)) {
    return undefined;
  }

  return provider;
}
