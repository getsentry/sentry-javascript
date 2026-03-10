import {
  type Context,
  createContextKey,
  propagation,
  type TextMapGetter,
  type TextMapSetter,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Client, IntegrationFn } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
  registerExternalPropagationContext,
  SENTRY_API_VERSION,
} from '@sentry/core';

interface OtlpIntegrationOptions {
  /**
   * Whether to set up the OTLP traces exporter that sends spans to Sentry.
   * Default: true
   */
  setupOtlpTracesExporter?: boolean;

  /**
   * Whether to set up the Sentry propagator that injects/extracts sentry-trace and baggage headers.
   * Default: true
   */
  setupPropagator?: boolean;

  /**
   * Whether to capture exceptions recorded on OTel spans as Sentry errors.
   * Default: false
   */
  captureExceptions?: boolean;
}

const INTEGRATION_NAME = 'OtlpIntegration';

const _otlpIntegration = ((userOptions: OtlpIntegrationOptions = {}) => {
  const options: Required<OtlpIntegrationOptions> = {
    setupOtlpTracesExporter: userOptions.setupOtlpTracesExporter ?? true,
    setupPropagator: userOptions.setupPropagator ?? true,
    captureExceptions: userOptions.captureExceptions ?? false,
  };

  let _spanProcessor: BatchSpanProcessor | undefined;
  let _tracerProvider: BasicTracerProvider | undefined;

  return {
    name: INTEGRATION_NAME,

    setup(_client: Client): void {
      // Always register external propagation context so that Sentry error/log events
      // are linked to the active OTel trace context.
      registerExternalPropagationContext(() => {
        const activeSpan = trace.getActiveSpan();
        if (!activeSpan) {
          return undefined;
        }
        const spanContext = activeSpan.spanContext();
        return { traceId: spanContext.traceId, spanId: spanContext.spanId };
      });

      debug.log(`[${INTEGRATION_NAME}] External propagation context registered.`);
    },

    afterAllSetup(client: Client): void {
      if (options.setupOtlpTracesExporter) {
        setupTracesExporter(client);
      }

      if (options.setupPropagator) {
        setupPropagator();
      }

      if (options.captureExceptions) {
        setupExceptionInterceptor();
      }
    },
  };

  function setupTracesExporter(client: Client): void {
    const dsn = client.getDsn();
    if (!dsn) {
      debug.warn(`[${INTEGRATION_NAME}] No DSN found. OTLP exporter not set up.`);
      return;
    }

    const { protocol, host, port, path, projectId, publicKey } = dsn;

    const basePath = path ? `/${path}` : '';
    const portStr = port ? `:${port}` : '';
    const endpoint = `${protocol}://${host}${portStr}${basePath}/api/${projectId}/integration/otlp/v1/traces/`;

    const sdkInfo = client.getSdkMetadata()?.sdk;
    const sentryClient = sdkInfo ? `, sentry_client=${sdkInfo.name}/${sdkInfo.version}` : '';
    const authHeader = `Sentry sentry_version=${SENTRY_API_VERSION}, sentry_key=${publicKey}${sentryClient}`;

    let exporter: SpanExporter;
    try {
      exporter = new OTLPTraceExporter({
        url: endpoint,
        headers: {
          'X-Sentry-Auth': authHeader,
        },
      });
    } catch (e) {
      debug.warn(`[${INTEGRATION_NAME}] Failed to create OTLPTraceExporter:`, e);
      return;
    }

    _spanProcessor = new BatchSpanProcessor(exporter);

    // Add span processor to existing global tracer provider.
    // trace.getTracerProvider() returns a ProxyTracerProvider; unwrap it to get the real provider.
    const globalProvider = trace.getTracerProvider();
    const delegate =
      'getDelegate' in globalProvider
        ? (globalProvider as unknown as { getDelegate(): unknown }).getDelegate()
        : globalProvider;

    // In OTel v2, addSpanProcessor was removed. We push into the internal _spanProcessors
    // array on the MultiSpanProcessor, which is how OTel's own forceFlush() accesses it.
    const activeProcessor = (delegate as Record<string, unknown>)?._activeSpanProcessor as
      | { _spanProcessors?: unknown[] }
      | undefined;
    if (activeProcessor?._spanProcessors) {
      activeProcessor._spanProcessors.push(_spanProcessor);
      debug.log(`[${INTEGRATION_NAME}] Added span processor to existing TracerProvider.`);
    } else {
      // No user-configured provider; create a minimal one and set it as global
      _tracerProvider = new BasicTracerProvider({
        spanProcessors: [_spanProcessor],
      });
      trace.setGlobalTracerProvider(_tracerProvider);
      debug.log(`[${INTEGRATION_NAME}] Created new TracerProvider with OTLP span processor.`);
    }

    client.on('flush', () => {
      void _spanProcessor?.forceFlush();
    });

    client.on('close', () => {
      void _spanProcessor?.shutdown();
      void _tracerProvider?.shutdown();
    });
  }

  function setupPropagator(): void {
    propagation.setGlobalPropagator(new SentryOTLPPropagator());
    debug.log(`[${INTEGRATION_NAME}] Sentry OTLP propagator installed.`);
  }

  function setupExceptionInterceptor(): void {
    // Get the Span implementation class by creating a temporary span from a temporary provider.
    // SpanImpl is not exported from @opentelemetry/sdk-trace-base's public API,
    // so we discover it at runtime to patch recordException.
    const tempProvider = new BasicTracerProvider();
    const tempTracer = tempProvider.getTracer('sentry-otlp-setup');
    const tempSpan = tempTracer.startSpan('sentry-otlp-setup');

    const SpanClass = (Object.getPrototypeOf(tempSpan) as { constructor: { prototype: Record<string, unknown> } })
      .constructor;
    tempSpan.end();
    tempProvider.shutdown().catch(() => undefined);

    if (typeof SpanClass?.prototype?.recordException !== 'function') {
      debug.warn(`[${INTEGRATION_NAME}] Could not find Span.recordException to patch.`);
      return;
    }

    // Check if already patched (flag stored on the prototype to survive multiple integration instances)
    if (SpanClass.prototype.__sentry_patched_exception__) {
      return;
    }
    SpanClass.prototype.__sentry_patched_exception__ = true;

    const originalRecordException = SpanClass.prototype.recordException as (
      exception: unknown,
      ...rest: unknown[]
    ) => void;
    SpanClass.prototype.recordException = new Proxy(originalRecordException, {
      apply(target, thisArg, argArray) {
        captureException(argArray[0], { mechanism: { type: 'auto.otlp.record_exception', handled: false } });
        return Reflect.apply(target, thisArg, argArray);
      },
    });
  }
}) satisfies IntegrationFn;

/**
 * OTLP integration for the Sentry light SDK.
 *
 * Bridges an existing OpenTelemetry setup with Sentry by:
 * 1. Linking Sentry error/log events to the active OTel trace context
 * 2. Exporting OTel spans to Sentry via OTLP
 * 3. Propagating sentry-trace/baggage headers via a custom OTel propagator
 * 4. Optionally capturing exceptions recorded on OTel spans
 */
export const otlpIntegration = defineIntegration(_otlpIntegration);

const SENTRY_BAGGAGE_KEY = createContextKey('sentry-baggage');

class SentryOTLPPropagator {
  public inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    const span = trace.getSpan(ctx);
    if (!span) {
      return;
    }

    const spanContext = span.spanContext();
    const sampled = spanContext.traceFlags === TraceFlags.SAMPLED;
    const sentryTrace = generateSentryTraceHeader(spanContext.traceId, spanContext.spanId, sampled);
    setter.set(carrier, 'sentry-trace', sentryTrace);

    // Pass through Sentry baggage (DSC) that was stored on the context during extract.
    // We don't generate new baggage as head SDK since we have no transaction semantic in OTLP mode.
    const dsc = ctx.getValue(SENTRY_BAGGAGE_KEY) as Record<string, string> | undefined;
    const baggageStr = dynamicSamplingContextToSentryBaggageHeader(dsc);
    if (baggageStr) {
      setter.set(carrier, 'baggage', baggageStr);
    }
  }

  public extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context {
    const sentryTraceValue = getter.get(carrier, 'sentry-trace');
    const baggageValue = getter.get(carrier, 'baggage');

    const sentryTrace = Array.isArray(sentryTraceValue) ? sentryTraceValue[0] : sentryTraceValue;
    const baggage = Array.isArray(baggageValue) ? baggageValue[0] : baggageValue;

    if (!sentryTrace) {
      return ctx;
    }

    const propagationContext = propagationContextFromHeaders(sentryTrace, baggage);

    // Store the DSC on the OTel context so inject() can pass it through
    let updatedCtx = propagationContext.dsc ? ctx.setValue(SENTRY_BAGGAGE_KEY, propagationContext.dsc) : ctx;

    // Create a remote span context from the extracted data so OTel links to the right trace
    const { traceId, parentSpanId } = propagationContext;
    if (traceId && parentSpanId) {
      // Always set SAMPLED so OTel records the span — leave sampling decisions to Sentry
      const remoteSpanContext = {
        traceId,
        spanId: parentSpanId,
        traceFlags: TraceFlags.SAMPLED,
        isRemote: true,
      };

      updatedCtx = trace.setSpanContext(updatedCtx, remoteSpanContext);
    }

    return updatedCtx;
  }

  public fields(): string[] {
    return ['sentry-trace', 'baggage'];
  }
}
