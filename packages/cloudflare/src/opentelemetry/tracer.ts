import type { Context, Span, SpanOptions, Tracer, TracerProvider } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { startInactiveSpan, startSpanManual } from '@sentry/core';

/**
 * Set up a mock OTEL tracer to allow inter-op with OpenTelemetry emitted spans.
 * This is not perfect but handles easy/common use cases.
 */
export function setupOpenTelemetryTracer(): void {
  trace.setGlobalTracerProvider(new SentryCloudflareTraceProvider());
}

class SentryCloudflareTraceProvider implements TracerProvider {
  private readonly _tracers: Map<string, Tracer> = new Map();

  public getTracer(name: string, version?: string, options?: { schemaUrl?: string }): Tracer {
    const key = `${name}@${version || ''}:${options?.schemaUrl || ''}`;
    if (!this._tracers.has(key)) {
      this._tracers.set(key, new SentryCloudflareTracer());
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this._tracers.get(key)!;
  }
}

class SentryCloudflareTracer implements Tracer {
  public startSpan(name: string, options?: SpanOptions): Span {
    return startInactiveSpan({
      ...options,
      name,
      attributes: {
        ...options?.attributes,
        'sentry.cloudflare_tracer': true,
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

    const spanOpts = {
      ...opts,
      name,
      attributes: {
        ...opts.attributes,
        'sentry.cloudflare_tracer': true,
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
}
