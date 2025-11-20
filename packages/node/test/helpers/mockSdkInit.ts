import { context, propagation, ProxyTracerProvider, trace } from '@opentelemetry/api';
import { BasicTracerProvider, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getClient, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';
import { SentrySpanProcessor } from '@sentry/opentelemetry';
import type { NodeClient } from '../../src';
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
    ...options,
  });
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

export function getSpanProcessor(): SentrySpanProcessor | undefined {
  const client = getClient<NodeClient>();
  if (!client?.traceProvider) {
    return undefined;
  }

  const provider = getProvider(client.traceProvider);
  if (!provider) {
    return undefined;
  }

  // Access the span processors from the provider via _activeSpanProcessor
  const multiSpanProcessor = provider?.['_activeSpanProcessor'] as
    | (SpanProcessor & { _spanProcessors?: SpanProcessor[] })
    | undefined;

  const spanProcessor = multiSpanProcessor?.['_spanProcessors']?.find(
    (spanProcessor: SpanProcessor) => spanProcessor instanceof SentrySpanProcessor,
  );

  return spanProcessor;
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
