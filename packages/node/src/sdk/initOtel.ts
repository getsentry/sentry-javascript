import { context, propagation, trace } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { _INTERNAL_setDeferSegmentSpanCapture, debug as coreDebug, hasSpanStreamingEnabled } from '@sentry/core';
import {
  initializeEsmLoader,
  type NodeClient,
  SentryContextManager,
  setupOpenTelemetryLogger,
} from '@sentry/node-core';
import {
  applyOtelSpanData,
  type AsyncLocalStorageLookup,
  backfillStreamedSpanDataFromOtel,
  getSentryResource,
  type OpenTelemetryTracerProvider,
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
  SentryTracerProvider,
  setIsSetup,
} from '@sentry/opentelemetry';
import { DEBUG_BUILD } from '../debug-build';
import { getOpenTelemetryInstrumentationToPreload } from '../integrations/tracing';

// About 277h - this must fit into new Array(len)!
const MAX_MAX_SPAN_WAIT_DURATION = 1_000_000;

interface AdditionalOpenTelemetryOptions {
  /** Additional SpanProcessor instances that should be used. */
  spanProcessors?: SpanProcessor[];
}

/**
 * Initialize OpenTelemetry for Node.
 */
export function initOpenTelemetry(client: NodeClient, options: AdditionalOpenTelemetryOptions = {}): void {
  if (client.getOptions().debug) {
    setupOpenTelemetryLogger();
  }

  const [provider, asyncLocalStorageLookup] = setupOtel(client, options);
  client.traceProvider = provider;
  client.asyncLocalStorageLookup = asyncLocalStorageLookup;
}

interface NodePreloadOptions {
  debug?: boolean;
  integrations?: string[];
}

/**
 * Preload OpenTelemetry for Node.
 * This can be used to preload instrumentation early, but set up Sentry later.
 * By preloading the OTEL instrumentation wrapping still happens early enough that everything works.
 */
export function preloadOpenTelemetry(options: NodePreloadOptions = {}): void {
  const { debug } = options;

  if (debug) {
    coreDebug.enable();
  }

  initializeEsmLoader();

  // These are all integrations that we need to pre-load to ensure they are set up before any other code runs
  getPreloadMethods(options.integrations).forEach(fn => {
    fn();

    if (debug) {
      coreDebug.log(`[Sentry] Preloaded ${fn.id} instrumentation`);
    }
  });
}

function getPreloadMethods(integrationNames?: string[]): ((() => void) & { id: string })[] {
  const instruments = getOpenTelemetryInstrumentationToPreload();

  if (!integrationNames) {
    return instruments;
  }

  // We match exact matches of instrumentation, but also match prefixes, e.g. "Fastify.v5" will match "Fastify"
  return instruments.filter(instrumentation => {
    const id = instrumentation.id;
    return integrationNames.some(integrationName => id === integrationName || id.startsWith(`${integrationName}.`));
  });
}

/** Just exported for tests. */
export function setupOtel(
  client: NodeClient,
  options: AdditionalOpenTelemetryOptions = {},
): [OpenTelemetryTracerProvider | undefined, AsyncLocalStorageLookup | undefined] {
  // Sentry's minimal tracer provider is the default. We fall back to the full OpenTelemetry SDK
  // `BasicTracerProvider` when the user explicitly opts in via `openTelemetryBasicTracerProvider`, or
  // when they provide custom `openTelemetrySpanProcessors` — those require the SDK span pipeline
  // that the minimal provider does not run.
  const shouldUseBasicTracerProvider =
    client.getOptions().openTelemetryBasicTracerProvider || !!options.spanProcessors?.length;

  if (!shouldUseBasicTracerProvider) {
    return setupSentryTracerProvider(client);
  }

  // Create and configure NodeTracerProvider
  const provider = new BasicTracerProvider({
    sampler: new SentrySampler(client),
    resource: getSentryResource('node'),
    forceFlushTimeoutMillis: 500,
    spanProcessors: [
      new SentrySpanProcessor({
        timeout: _clampSpanProcessorTimeout(client.getOptions().maxSpanWaitDuration),
        client,
      }),
      ...(options.spanProcessors || []),
    ],
  });

  // Register as globals
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());

  const ctxManager = new SentryContextManager();
  context.setGlobalContextManager(ctxManager);

  return [provider, ctxManager.getAsyncLocalStorageLookup()];
}

function setupSentryTracerProvider(
  client: NodeClient,
): [SentryTracerProvider | undefined, AsyncLocalStorageLookup | undefined] {
  const provider = new SentryTracerProvider({ resource: getSentryResource('node') });

  if (!trace.setGlobalTracerProvider(provider)) {
    DEBUG_BUILD &&
      coreDebug.warn(
        'Could not register SentryTracerProvider because another OpenTelemetry tracer provider is already registered.',
      );
    return [undefined, undefined];
  }

  // Only mark the provider as set up once it is actually the registered global
  // tracer provider, so setup validation doesn't skip required checks when
  // registration failed.
  setIsSetup('SentryTracerProvider');

  propagation.setGlobalPropagator(new SentryPropagator());

  const ctxManager = new SentryContextManager();
  context.setGlobalContextManager(ctxManager);

  client.on('spanEnd', span => {
    applyOtelSpanData(span, { finalizeStatus: true });
  });

  // Defer this client's segment-span transaction capture (via a debounced timer) so child spans whose
  // async instrumentation closes them after the root span — a diagnostics-channel `asyncEnd` callback
  // in the same tick, or engine spans replayed on a later tick (e.g. prisma) — are still finished in
  // time to be included instead of dropped. Scoped to the SentryTracerProvider path, which assembles
  // transactions synchronously from the native span tree (the BasicTracerProvider path defers this to
  // the span exporter, which already buffers and debounces).
  _INTERNAL_setDeferSegmentSpanCapture(client);

  if (hasSpanStreamingEnabled(client)) {
    // Streamed spans skip the exporter, so per-span data inferred from OTel semantic conventions
    // (notably `sentry.source` on child spans, which `applyOtelSpanData` only sets on segment roots)
    // is backfilled here, reusing the exact inference the OTel SDK `SentrySpanProcessor` applies.
    client.on('preprocessSpan', backfillStreamedSpanDataFromOtel);
  }

  client.on('preprocessEvent', event => {
    if (event.type !== 'transaction') {
      return;
    }

    event.contexts = {
      ...event.contexts,
      otel: {
        resource: provider.resource?.attributes,
        ...event.contexts?.otel,
      },
    };
  });

  return [provider, ctxManager.getAsyncLocalStorageLookup()];
}

/** Just exported for tests. */
export function _clampSpanProcessorTimeout(maxSpanWaitDuration: number | undefined): number | undefined {
  if (maxSpanWaitDuration == null) {
    return undefined;
  }

  // We guard for a max. value here, because we create an array with this length
  // So if this value is too large, this would fail
  if (maxSpanWaitDuration > MAX_MAX_SPAN_WAIT_DURATION) {
    DEBUG_BUILD &&
      coreDebug.warn(`\`maxSpanWaitDuration\` is too high, using the maximum value of ${MAX_MAX_SPAN_WAIT_DURATION}`);
    return MAX_MAX_SPAN_WAIT_DURATION;
  } else if (maxSpanWaitDuration <= 0 || Number.isNaN(maxSpanWaitDuration)) {
    DEBUG_BUILD && coreDebug.warn('`maxSpanWaitDuration` must be a positive number, using default value instead.');
    return undefined;
  }

  return maxSpanWaitDuration;
}
