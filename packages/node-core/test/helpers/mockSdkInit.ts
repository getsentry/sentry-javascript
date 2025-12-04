import { context, propagation, ProxyTracerProvider, trace } from '@opentelemetry/api';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BasicTracerProvider, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import {
  createTransport,
  debug,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  resolvedSyncPromise,
  SDK_VERSION,
} from '@sentry/core';
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from '@sentry/opentelemetry';
import type { NodeClient } from '../../src';
import { SentryContextManager, validateOpenTelemetrySetup } from '../../src';
import { init } from '../../src/sdk';
import type { NodeClientOptions } from '../../src/types';

const PUBLIC_DSN = 'https://username@domain/123';

// About 277h - this must fit into new Array(len)!
const MAX_MAX_SPAN_WAIT_DURATION = 1_000_000;

/** Clamp span processor timeout to reasonable values, mirroring Node SDK behavior. */
function clampSpanProcessorTimeout(maxSpanWaitDuration: number | undefined): number | undefined {
  if (maxSpanWaitDuration == null) {
    return undefined;
  }

  // We guard for a max. value here, because we create an array with this length
  // So if this value is too large, this would fail
  if (maxSpanWaitDuration > MAX_MAX_SPAN_WAIT_DURATION) {
    debug.warn(`\`maxSpanWaitDuration\` is too high, using the maximum value of ${MAX_MAX_SPAN_WAIT_DURATION}`);
    return MAX_MAX_SPAN_WAIT_DURATION;
  } else if (maxSpanWaitDuration <= 0 || Number.isNaN(maxSpanWaitDuration)) {
    debug.warn('`maxSpanWaitDuration` must be a positive number, using default value instead.');
    return undefined;
  }

  return maxSpanWaitDuration;
}

export function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

export function setupOtel(client: NodeClient): BasicTracerProvider | undefined {
  if (!client) {
    return undefined;
  }

  const clientOptions = client.getOptions();
  const spanProcessorTimeout = clampSpanProcessorTimeout(clientOptions.maxSpanWaitDuration);

  // Create and configure TracerProvider with same config as Node SDK
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'node',
        // eslint-disable-next-line deprecation/deprecation
        [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
        [ATTR_SERVICE_VERSION]: SDK_VERSION,
      }),
    ),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [
      new SentrySpanProcessor({
        timeout: spanProcessorTimeout,
      }),
    ],
  });

  // Register as globals
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());
  context.setGlobalContextManager(new SentryContextManager());

  validateOpenTelemetrySetup();

  return provider;
}

export function mockSdkInit(options?: Partial<NodeClientOptions>) {
  resetGlobals();
  const client = init({
    dsn: PUBLIC_DSN,
    defaultIntegrations: false,
    // We are disabling client reports because we would be acquiring resources with every init call and that would leak
    // memory every time we call init in the tests
    sendClientReports: false,
    // Use a mock transport to prevent network calls
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    ...options,
  });

  // Always set up OpenTelemetry if we have a client
  if (client) {
    const provider = setupOtel(client);
    // Important: Link the provider to the client so getProvider() can find it
    client.traceProvider = provider;
  }

  return client;
}

export function cleanupOtel(_provider?: BasicTracerProvider): void {
  const provider = getProvider(_provider);

  if (provider) {
    void provider.forceFlush();
    void provider.shutdown();
  }

  // Disable all globally registered APIs
  trace.disable();
  context.disable();
  propagation.disable();

  // Reset globals to ensure clean state
  resetGlobals();
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
  // Casted as any because _activeSpanProcessor is marked as readonly
  const multiSpanProcessor = (provider as any)._activeSpanProcessor as
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
