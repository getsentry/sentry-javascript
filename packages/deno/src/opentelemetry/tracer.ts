import type { Context, Span, SpanOptions, Tracer, TracerProvider } from '@opentelemetry/api';
import { SpanKind, trace } from '@opentelemetry/api';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  startSpanManual,
} from '@sentry/core';

/**
 * Set up a mock OTEL tracer to allow inter-op with OpenTelemetry emitted spans.
 * This is not perfect but handles easy/common use cases.
 */
export function setupOpenTelemetryTracer(): void {
  trace.setGlobalTracerProvider(new SentryDenoTraceProvider());
}

class SentryDenoTraceProvider implements TracerProvider {
  private readonly _tracers: Map<string, Tracer> = new Map();

  public getTracer(name: string, version?: string, options?: { schemaUrl?: string }): Tracer {
    const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`;
    if (!this._tracers.has(key)) {
      this._tracers.set(key, new SentryDenoTracer());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this._tracers.get(key)!;
  }
}

class SentryDenoTracer implements Tracer {
  public startSpan(name: string, options?: SpanOptions): Span {
    // Map OpenTelemetry SpanKind to Sentry operation
    const op = this._mapSpanKindToOp(options?.kind);

    return startInactiveSpan({
      ...options,
      name,
      attributes: {
        ...options?.attributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
        'sentry.deno_tracer': true,
      },
    });
  }

  /**
   * NOTE: This does not handle `context` being passed in. It will always put spans on the current scope.
   */
  public startActiveSpan<F extends (span: Span) => unknown>(name: string, fn: F): ReturnType<F>;
  public startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
  public startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    context: Context,
    fn: F,
  ): ReturnType<F>;
  public startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: unknown,
    context?: unknown,
    fn?: F,
  ): ReturnType<F> {
    const opts = (typeof options === 'object' && options !== null ? options : {}) as SpanOptions;

    // Map OpenTelemetry SpanKind to Sentry operation
    const op = this._mapSpanKindToOp(opts.kind);

    const spanOpts = {
      ...opts,
      name,
      attributes: {
        ...opts.attributes,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
        'sentry.deno_tracer': true,
      },
    };

    const callback = (
      typeof options === 'function'
        ? options
        : typeof context === 'function'
          ? context
          : typeof fn === 'function'
            ? fn
            : () => {}
    ) as F;

    // In OTEL the semantic matches `startSpanManual` because spans are not auto-ended
    return startSpanManual(spanOpts, callback) as ReturnType<F>;
  }

  private _mapSpanKindToOp(kind?: SpanKind): string {
    switch (kind) {
      case SpanKind.CLIENT:
        return 'http.client';
      case SpanKind.SERVER:
        return 'http.server';
      case SpanKind.PRODUCER:
        return 'message.produce';
      case SpanKind.CONSUMER:
        return 'message.consume';
      default:
        return 'otel.span';
    }
  }
}
