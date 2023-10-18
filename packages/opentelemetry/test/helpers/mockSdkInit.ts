import { context, propagation, ProxyTracerProvider, trace } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ClientOptions, Options } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

import { setOpenTelemetryContextAsyncContextStrategy } from '../../src/asyncContextStrategy';
import { setupGlobalHub } from '../../src/custom/hub';
import { initOtel } from './initOtel';
import { init as initTestClient } from './TestClient';

const PUBLIC_DSN = 'https://username@domain/123';

/**
 * Initialize Sentry for Node.
 */
function init(options: Partial<Options> | undefined = {}): void {
  setupGlobalHub();

  const fullOptions: Partial<Options> = {
    instrumenter: 'otel',
    ...options,
  };

  initTestClient(fullOptions);
  initOtel();
  setOpenTelemetryContextAsyncContextStrategy();
}

export function mockSdkInit(options?: Partial<ClientOptions>) {
  GLOBAL_OBJ.__SENTRY__ = {
    extensions: {},
    hub: undefined,
    globalEventProcessors: [],
    logger: undefined,
  };

  init({ dsn: PUBLIC_DSN, ...options });
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
