import { context, propagation, ProxyTracerProvider, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { GLOBAL_OBJ } from '@sentry/utils';

import { init } from '../../src/sdk/init';
import type { NodeExperimentalClientOptions } from '../../src/types';

const PUBLIC_DSN = 'https://username@domain/123';

export function mockSdkInit(options?: Partial<NodeExperimentalClientOptions>) {
  GLOBAL_OBJ.__SENTRY__ = {
    extensions: {},
    hub: undefined,
    globalEventProcessors: [],
    logger: undefined,
  };

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
  let provider = _provider || trace.getTracerProvider();

  if (provider instanceof ProxyTracerProvider) {
    provider = provider.getDelegate();
  }

  if (!(provider instanceof BasicTracerProvider)) {
    return undefined;
  }

  return provider;
}
