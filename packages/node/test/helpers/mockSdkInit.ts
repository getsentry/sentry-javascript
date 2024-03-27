import { ProxyTracerProvider, context, propagation, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import type { NodeClient } from '../../src';

import { init } from '../../src/sdk/init';
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
  init({ dsn: PUBLIC_DSN, defaultIntegrations: false, ...options });
}

export function cleanupOtel(_provider?: BasicTracerProvider): void {
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
  let provider = _provider || getClient<NodeClient>()?.traceProvider || trace.getTracerProvider();

  if (provider instanceof ProxyTracerProvider) {
    provider = provider.getDelegate();
  }

  if (!(provider instanceof BasicTracerProvider)) {
    return undefined;
  }

  return provider;
}
