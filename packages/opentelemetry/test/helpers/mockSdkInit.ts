import { ProxyTracerProvider, context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ClientOptions, Options } from '@sentry/core';
import { getClient } from '@sentry/core';

import { getCurrentScope, getGlobalScope, getIsolationScope, flush } from '@sentry/core';
import { setOpenTelemetryContextAsyncContextStrategy } from '../../src/asyncContextStrategy';
import { clearOpenTelemetrySetupCheck } from '../../src/utils/setupCheck';
import { init as initTestClient } from './TestClient';
import { initOtel } from './initOtel';
import type { OpenTelemetryClient } from '../../src/types';

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
  delete (global as any).__SENTRY__;
}

export function mockSdkInit(options?: Partial<ClientOptions>) {
  resetGlobals();

  init({ dsn: PUBLIC_DSN, ...options });
}

export async function cleanupOtel(_provider?: BasicTracerProvider): Promise<void> {
  clearOpenTelemetrySetupCheck();

  const provider = getProvider(_provider);

  if (provider) {
    await provider.forceFlush();
    await provider.shutdown();
  }

  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();

  await flush();
}

export function getProvider(_provider?: BasicTracerProvider): BasicTracerProvider | undefined {
  let provider = _provider || getClient<OpenTelemetryClient>()?.traceProvider || trace.getTracerProvider();

  if (provider instanceof ProxyTracerProvider) {
    provider = provider.getDelegate();
  }

  if (!(provider instanceof BasicTracerProvider)) {
    return undefined;
  }

  return provider;
}
